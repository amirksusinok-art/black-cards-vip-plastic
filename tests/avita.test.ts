import { describe, it, expect, beforeAll } from 'vitest';
import {
  evaluateSingleCard,
  evaluateBatchCards,
  generateInitialGreeting,
  processBargainRound,
} from '../server/src/avitaEngine.js';
import { initDatabase, query, withTransaction } from '../server/src/db.js';

describe('Avita Merchant Engine & Integration Tests', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  it('Calculates correct valuations based on material and category', () => {
    const card = {
      id: 101,
      material: 'Titanium',
      category: 'Mirror',
      collector_score: 95,
      is_free_roll: false,
    };

    const evaluation = evaluateSingleCard(card);
    expect(evaluation.isEligible).toBe(true);
    expect(evaluation.maxPrice).toBeGreaterThan(20000);
    expect(evaluation.initialPrice).toBeLessThan(evaluation.maxPrice);
    expect(evaluation.initialPrice).toBeGreaterThan(10000);
  });

  it('Strictly rejects free roll (BOMZH mode) cards with designated message', () => {
    const freeCard = {
      id: 102,
      material: 'Classic Plastic',
      category: 'Standard',
      collector_score: 20,
      is_free_roll: true,
    };

    const evaluation = evaluateSingleCard(freeCard);
    expect(evaluation.isEligible).toBe(false);
    expect(evaluation.rejectReason).toContain('бесплатном режиме');
    expect(evaluation.initialPrice).toBe(0);
  });

  it('Batch evaluation correctly sums prices and filters ineligible cards', () => {
    const cards = [
      { id: 1, material: 'Gold', category: 'Pair', collector_score: 50, is_free_roll: false },
      { id: 2, material: 'Black Carbon', category: 'Triple', collector_score: 70, is_free_roll: false },
      { id: 3, material: 'Classic Plastic', category: 'Standard', collector_score: 10, is_free_roll: true }, // Free card
    ];

    const batch = evaluateBatchCards(cards);
    expect(batch.evaluations.length).toBe(2);
    expect(batch.ineligibleCards.length).toBe(1);
    expect(batch.totalInitial).toBeGreaterThan(5000);
    expect(batch.totalMax).toBeGreaterThan(batch.totalInitial);
  });

  it('Bargaining round 1: raises offer for reasonable player demand', () => {
    const res = processBargainRound({
      currentOffer: 6500,
      maxOffer: 8000,
      playerDemand: 7500,
      round: 1,
    });

    expect(res.accepted).toBe(false);
    expect(res.rejected).toBe(false);
    expect(res.newOffer).toBeGreaterThan(6500);
    expect(res.newOffer).toBeLessThanOrEqual(8000);
    expect(res.avitaReply).toContain('Могу поднять до');
  });

  it('Bargaining round 1: immediately rejects and blocks if demand is insanely high', () => {
    const res = processBargainRound({
      currentOffer: 5000,
      maxOffer: 7000,
      playerDemand: 25000, // > 2.2x maxOffer
      round: 1,
    });

    expect(res.accepted).toBe(false);
    expect(res.rejected).toBe(true);
    expect(res.avitaReply).toContain('две минуты');
  });

  it('Bargaining round 3: rejects and triggers 120-second cooldown if demand still exceeds maxOffer', () => {
    const res = processBargainRound({
      currentOffer: 7000,
      maxOffer: 7500,
      playerDemand: 9000,
      round: 3, // Exhausted all 3 rounds
    });

    expect(res.accepted).toBe(false);
    expect(res.rejected).toBe(true);
    expect(res.avitaReply).toContain('две минуты');
  });

  it('Accepts deal immediately if player agrees to current offer', () => {
    const res = processBargainRound({
      currentOffer: 7000,
      maxOffer: 8000,
      playerDemand: 7000,
      round: 2,
    });

    expect(res.accepted).toBe(true);
    expect(res.rejected).toBe(false);
    expect(res.avitaReply).toContain('По рукам');
  });

  it('Stores 120s cooldown on user in DB and enforces cooldown lock', async () => {
    const testTgId = Math.floor(Math.random() * 800000000) + 100000000;
    const userRes = await query(
      `INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3) RETURNING *`,
      [testTgId, 'avita_test_user', 1000]
    );
    const user = userRes.rows[0];

    // Set 120s block
    const blockedUntil = new Date(Date.now() + 120 * 1000).toISOString();
    await query('UPDATE users SET avita_blocked_until = $1 WHERE id = $2', [blockedUntil, user.id]);

    const checkRes = await query('SELECT * FROM users WHERE id = $1', [user.id]);
    expect(checkRes.rows[0].avita_blocked_until).toBe(blockedUntil);

    const isLocked = new Date(checkRes.rows[0].avita_blocked_until).getTime() > Date.now();
    expect(isLocked).toBe(true);
  });

  it('Marking cards as sold removes them from active inventory and favorites', async () => {
    const testTgId = Math.floor(Math.random() * 800000000) + 100000000;
    const userRes = await query(
      `INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3) RETURNING *`,
      [testTgId, 'seller_user', 500]
    );
    const user = userRes.rows[0];

    // Create a card
    const cardRes = await query(
      `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll)
       VALUES ('uid_test_sale', $1, 'Алфа Банк', 'Gold', 'Standard', '4000 1234 5678 9010', 'AB-GLD-STD', '12/28', 50, false)
       RETURNING *`,
      [user.id]
    );
    const card = cardRes.rows[0];

    // Add to favorites
    await query('INSERT INTO user_favorites (user_id, card_id) VALUES ($1, $2)', [user.id, card.id]);

    // Perform sale via transaction
    await withTransaction(async (client) => {
      await client.query('UPDATE cards SET is_sold = true, sold_price = $1, sold_at = CURRENT_TIMESTAMP WHERE id = $2', [
        4500,
        card.id,
      ]);
      await client.query('DELETE FROM user_favorites WHERE user_id = $1 AND card_id = $2', [user.id, card.id]);
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [4500, user.id]);
    });

    // Check inventory query
    const invRes = await query(
      'SELECT * FROM cards WHERE user_id = $1 AND (is_sold IS NULL OR is_sold = false)',
      [user.id]
    );
    expect(invRes.rows.find((c: any) => c.id === card.id)).toBeUndefined();

    // Check favorites
    const favRes = await query('SELECT * FROM user_favorites WHERE user_id = $1 AND card_id = $2', [
      user.id,
      card.id,
    ]);
    expect(favRes.rowCount).toBe(0);

    // Check balance
    const updatedUser = (await query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
    expect(updatedUser.coins).toBe(5000);
  });
});
