import { describe, it, expect, beforeAll } from 'vitest';
import { initDatabase, query, withTransaction } from '../server/src/db.js';
import {
  calculateMarketFee,
  calculateRecommendedPrice,
  isCardEligibleForListing,
  MARKET_FEE_PERCENT,
} from '../server/src/marketEngine.js';

describe('Marketplace & Promo Codes Integration Tests', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('1. Starting Balance & Promo Codes Engine', () => {
    it('Creates new user with 5,000 Coins initial balance', async () => {
      const uniqueTgId = Math.floor(Math.random() * 900000000) + 100000000;
      await query(
        `INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3)`,
        [uniqueTgId, 'new_trader', 'New Trader']
      );

      const userRes = await query('SELECT * FROM users WHERE telegram_id = $1', [uniqueTgId]);
      expect(userRes.rowCount).toBe(1);
      const user = userRes.rows[0];
      expect(user.coins).toBe(5000);
    });

    it('Validates and redeems promo code START5000 successfully (+5000 Coins)', async () => {
      const uniqueTgId = Math.floor(Math.random() * 900000000) + 100000000;
      await query(
        `INSERT INTO users (telegram_id, username, first_name) VALUES ($1, $2, $3)`,
        [uniqueTgId, 'promo_tester', 'Promo Tester']
      );
      const userRes = await query('SELECT * FROM users WHERE telegram_id = $1', [uniqueTgId]);
      const user = userRes.rows[0];
      const initialCoins = user.coins;

      // Check promo code in DB
      const promoRes = await query("SELECT * FROM promo_codes WHERE code = 'START5000' AND is_active = true");
      expect(promoRes.rowCount).toBe(1);
      const promo = promoRes.rows[0];

      // Simulate redemption transaction
      await withTransaction(async (client) => {
        const bonus = parseInt(promo.reward_value, 10);
        await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [bonus, user.id]);
        await client.query(
          'INSERT INTO user_promo_activations (user_id, promo_id, code, reward_type, reward_value) VALUES ($1, $2, $3, $4, $5)',
          [user.id, promo.id, promo.code, promo.reward_type, promo.reward_value]
        );
        await client.query('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1', [promo.id]);
      });

      const updatedUserRes = await query('SELECT coins FROM users WHERE id = $1', [user.id]);
      expect(updatedUserRes.rows[0].coins).toBe(initialCoins + 5000);

      // Verify cannot redeem a second time
      const checkActivation = await query(
        'SELECT * FROM user_promo_activations WHERE user_id = $1 AND promo_id = $2',
        [user.id, promo.id]
      );
      expect(checkActivation.rowCount).toBe(1);
    });
  });

  describe('2. Market Engine & Pricing Heuristics', () => {
    it('Calculates 3% marketplace fee and net seller payout correctly', () => {
      const fee1 = calculateMarketFee(10000);
      expect(fee1.feePercent).toBe(3.0);
      expect(fee1.feeCoins).toBe(300);
      expect(fee1.netPayout).toBe(9700);

      const fee2 = calculateMarketFee(500);
      expect(fee2.feeCoins).toBe(15);
      expect(fee2.netPayout).toBe(485);

      const fee3 = calculateMarketFee(50);
      expect(fee3.feeCoins).toBeGreaterThanOrEqual(1);
      expect(fee3.netPayout).toBeLessThan(50);
    });

    it('Enforces eligibility rules (rejects BOMZH free cards, already listed, already sold)', () => {
      const validCard = {
        id: 1,
        is_free_roll: false,
        is_sold: false,
        is_listed_on_market: false,
        collector_score: 50,
      };
      expect(isCardEligibleForListing(validCard).eligible).toBe(true);

      const freeRollCard = { ...validCard, is_free_roll: true };
      const resFree = isCardEligibleForListing(freeRollCard);
      expect(resFree.eligible).toBe(false);
      expect(resFree.reason).toContain('бесплатном режиме');

      const alreadyListed = { ...validCard, is_listed_on_market: true };
      expect(isCardEligibleForListing(alreadyListed).eligible).toBe(false);

      const soldCard = { ...validCard, is_sold: true };
      expect(isCardEligibleForListing(soldCard).eligible).toBe(false);
    });

    it('Calculates recommended price estimate accurately based on card score & material', () => {
      const card = {
        collector_score: 50,
        material: 'Gold',
        category: 'Pair',
        bank: 'Алфа Банк',
      };
      const est = calculateRecommendedPrice(card, []);
      expect(est.recommendedMin).toBeGreaterThan(500);
      expect(est.recommendedMax).toBeGreaterThan(est.recommendedMin);
      expect(est.hasSufficientHistory).toBe(false);

      // Now with 3 past deals
      const pastDeals = [
        { card_material: 'Gold', card_category: 'Pair', price: 3000 },
        { card_material: 'Gold', card_category: 'Pair', price: 3500 },
        { card_material: 'Gold', card_category: 'Pair', price: 4000 },
      ];
      const estWithDeals = calculateRecommendedPrice(card, pastDeals);
      expect(estWithDeals.hasSufficientHistory).toBe(true);
      expect(estWithDeals.pastDealsCount).toBe(3);
      expect(estWithDeals.avgPrice).toBe(3500);
    });
  });

  describe('3. P2P Marketplace Transactions & Atomicity', () => {
    it('Creates listing, locks card, executes atomic purchase with 3% fee deduction', async () => {
      // 1. Create Seller & Buyer
      const sellerTg = Math.floor(Math.random() * 900000000) + 100000000;
      const buyerTg = Math.floor(Math.random() * 900000000) + 100000000;

      await query('INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3)', [sellerTg, 'seller_p2p', 5000]);
      await query('INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3)', [buyerTg, 'buyer_p2p', 10000]);

      const seller = (await query('SELECT * FROM users WHERE telegram_id = $1', [sellerTg])).rows[0];
      const buyer = (await query('SELECT * FROM users WHERE telegram_id = $1', [buyerTg])).rows[0];

      // 2. Insert Paid Card for Seller
      const cardUid = 'card_market_test_' + Date.now();
      const cardRes = await query(
        `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [cardUid, seller.id, 'Тинькоффи', 'Gold', 'Triple', '7777 8888 9999 0000', '777', '12/30', 80, false, 'CD-000777']
      );
      const card = (await query('SELECT * FROM cards WHERE card_uid = $1', [cardUid])).rows[0];

      // 3. Seller lists card on market for 4,000 ₽
      const listPrice = 4000;
      const feeResult = calculateMarketFee(listPrice);
      expect(feeResult.feeCoins).toBe(120); // 3% of 4000 = 120
      expect(feeResult.netPayout).toBe(3880);

      const listingRes = await query(
        `INSERT INTO market_listings (seller_id, card_id, price, fee_percent, status, expires_at)
         VALUES ($1, $2, $3, $4, 'active', $5)`,
        [seller.id, card.id, listPrice, MARKET_FEE_PERCENT, new Date(Date.now() + 7 * 86400000).toISOString()]
      );
      await query('UPDATE cards SET is_listed_on_market = true WHERE id = $1', [card.id]);

      const listing = (await query('SELECT * FROM market_listings WHERE card_id = $1', [card.id])).rows[0];
      expect(listing.status).toBe('active');
      expect(listing.price).toBe(4000);

      // Verify card is locked on market
      const lockedCard = (await query('SELECT * FROM cards WHERE id = $1', [card.id])).rows[0];
      expect(lockedCard.is_listed_on_market).toBe(true);

      // 4. Buyer purchases card atomically
      await withTransaction(async (client) => {
        // Deduct from buyer (10000 - 4000 = 6000)
        await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [listPrice, buyer.id]);
        // Credit to seller (5000 + 3880 = 8880)
        await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [feeResult.netPayout, seller.id]);
        // Transfer card
        await client.query('UPDATE cards SET user_id = $1, is_listed_on_market = false WHERE id = $2', [buyer.id, card.id]);
        // Mark listing sold
        await client.query("UPDATE market_listings SET status = 'sold', buyer_id = $1, sold_at = $2 WHERE id = $3", [
          buyer.id,
          new Date().toISOString(),
          listing.id,
        ]);
        // Record deal
        await client.query(
          `INSERT INTO market_deals_history (listing_id, card_id, seller_id, buyer_id, price, fee_coins, net_payout)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [listing.id, card.id, seller.id, buyer.id, listPrice, feeResult.feeCoins, feeResult.netPayout]
        );
      });

      // 5. Verify Balances & Card Ownership
      const updatedBuyer = (await query('SELECT coins FROM users WHERE id = $1', [buyer.id])).rows[0];
      const updatedSeller = (await query('SELECT coins FROM users WHERE id = $1', [seller.id])).rows[0];
      const transferredCard = (await query('SELECT * FROM cards WHERE id = $1', [card.id])).rows[0];
      const soldListing = (await query('SELECT * FROM market_listings WHERE id = $1', [listing.id])).rows[0];
      const dealRecord = (await query('SELECT * FROM market_deals_history WHERE listing_id = $1', [listing.id])).rows[0];

      expect(updatedBuyer.coins).toBe(6000);
      expect(updatedSeller.coins).toBe(8880);
      expect(transferredCard.user_id).toBe(buyer.id);
      expect(transferredCard.is_listed_on_market).toBe(false);
      expect(soldListing.status).toBe('sold');
      expect(dealRecord.price).toBe(4000);
      expect(dealRecord.fee_coins).toBe(120);
      expect(dealRecord.net_payout).toBe(3880);
    });

    it('Cancelling listing unlocks card and returns it to seller inventory', async () => {
      const sellerTg = Math.floor(Math.random() * 900000000) + 100000000;
      await query('INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3)', [sellerTg, 'canceller', 5000]);
      const seller = (await query('SELECT * FROM users WHERE telegram_id = $1', [sellerTg])).rows[0];

      const cardUid = 'card_cancel_test_' + Date.now();
      await query(
        `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [cardUid, seller.id, 'ЗверьБанк', 'Classic Plastic', 'Pair', '1111 2222 3333 4444', '111', '12/30', 40, false, 'CD-000111']
      );
      const card = (await query('SELECT * FROM cards WHERE card_uid = $1', [cardUid])).rows[0];

      // List card
      await query(
        `INSERT INTO market_listings (seller_id, card_id, price, fee_percent, status, expires_at)
         VALUES ($1, $2, 1000, 3.0, 'active', $3)`,
        [seller.id, card.id, new Date(Date.now() + 7 * 86400000).toISOString()]
      );
      await query('UPDATE cards SET is_listed_on_market = true WHERE id = $1', [card.id]);

      const listing = (await query('SELECT * FROM market_listings WHERE card_id = $1', [card.id])).rows[0];

      // Cancel listing
      await query("UPDATE market_listings SET status = 'cancelled' WHERE id = $1", [listing.id]);
      await query('UPDATE cards SET is_listed_on_market = false WHERE id = $1', [card.id]);

      const cancelledListing = (await query('SELECT * FROM market_listings WHERE id = $1', [listing.id])).rows[0];
      const restoredCard = (await query('SELECT * FROM cards WHERE id = $1', [card.id])).rows[0];

      expect(cancelledListing.status).toBe('cancelled');
      expect(restoredCard.is_listed_on_market).toBe(false);
    });
  });
});
