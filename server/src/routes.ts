import { Router, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest, isUserAdmin, adminMiddleware, ADMIN_SECRET_PASSWORD } from './auth.js';
import { query, withTransaction, getIsMockMode, getMockDB } from './db.js';
import { generateCard, BankName, MaterialName, CategoryName, CaseTier, CASE_TIERS } from './gameEngine.js';
import {
  evaluateSingleCard,
  evaluateBatchCards,
  generateInitialGreeting,
  processBargainRound,
} from './avitaEngine.js';
import {
  MAX_ENERGY,
  MAX_LEVEL,
  DAILY_HELP_AMOUNT,
  DAILY_HELP_COOLDOWN_MS,
  CLICKER_CONFIG,
  CLICKER_TASKS,
  calculateCurrentEnergy,
  validateTapBatch,
} from './clickerEngine.js';
import {
  MARKET_FEE_PERCENT,
  LISTING_DURATION_DAYS,
  calculateMarketFee,
  calculateRecommendedPrice,
  calculateListingExpiry,
  isCardEligibleForListing,
} from './marketEngine.js';

export const apiRouter = Router();

// Health Check
apiRouter.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({
      status: 'ok',
      service: 'CardDrop / Black Cards & VIP Plastic',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Helper: Get or Create User
async function getOrCreateUser(telegramUser: any) {
  let userRes = await query('SELECT * FROM users WHERE telegram_id = $1', [telegramUser.id]);
  if (userRes.rowCount === 0) {
    userRes = await query(
      `INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, coins, level, exp)
       VALUES ($1, $2, $3, $4, $5, 5000, 1, 0)
       RETURNING *`,
      [
        telegramUser.id,
        telegramUser.username || `user_${telegramUser.id}`,
        telegramUser.first_name || 'Player',
        telegramUser.last_name || '',
        telegramUser.photo_url || '',
      ]
    );
  }
  return userRes.rows[0];
}

/**
 * Helper: Automatically record daily login task progress (1/1)
 */
async function ensureDailyLoginTask(clientOrQuery: any, userId: number) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tRes = await clientOrQuery.query("SELECT * FROM daily_tasks WHERE task_key = 'daily_login'");
    if (tRes.rowCount > 0) {
      const task = tRes.rows[0];
      const utRes = await clientOrQuery.query(
        'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2 AND task_date = $3',
        [userId, task.id, today]
      );
      if (utRes.rowCount === 0) {
        await clientOrQuery.query(
          `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date)
           VALUES ($1, $2, 1, false, $3)`,
          [userId, task.id, today]
        );
      } else if (utRes.rows[0].current_progress < 1) {
        await clientOrQuery.query('UPDATE user_tasks SET current_progress = 1 WHERE id = $1', [utRes.rows[0].id]);
      }
    }
  } catch (err) {
    console.error('Error recording daily login task:', err);
  }
}

/**
 * Helper: Increment specific daily task progress
 */
async function recordTaskProgress(client: any, userId: number, taskKey: string, amount: number = 1) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const tRes = await client.query('SELECT * FROM daily_tasks WHERE task_key = $1', [taskKey]);
    if (tRes.rowCount > 0) {
      const task = tRes.rows[0];
      const utRes = await client.query(
        'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2 AND task_date = $3',
        [userId, task.id, today]
      );
      if (utRes.rowCount === 0) {
        const currentProgress = Math.min(task.target_count, amount);
        await client.query(
          `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date)
           VALUES ($1, $2, $3, false, $4)`,
          [userId, task.id, currentProgress, today]
        );
      } else {
        const ut = utRes.rows[0];
        const currentProgress = Math.min(task.target_count, (ut.current_progress || 0) + amount);
        await client.query(
          'UPDATE user_tasks SET current_progress = $1 WHERE id = $2',
          [currentProgress, ut.id]
        );
      }
    }
  } catch (err) {
    console.warn(`Failed to update task progress for ${taskKey}:`, err);
  }
}

/**
 * Helper: Increment roll_3_cards and check daily_mission task progress
 */
async function recordCardIssueTaskProgress(client: any, userId: number, count: number = 1, cards: any[] = []) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    // Find task 2 (roll_3_cards)
    const t2Res = await client.query("SELECT * FROM daily_tasks WHERE task_key = 'roll_3_cards'");
    if (t2Res.rowCount > 0) {
      const task2 = t2Res.rows[0];
      const ut2Res = await client.query(
        'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2 AND task_date = $3',
        [userId, task2.id, today]
      );
      let currentProgress = 0;
      if (ut2Res.rowCount === 0) {
        currentProgress = Math.min(task2.target_count, count);
        await client.query(
          `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date)
           VALUES ($1, $2, $3, false, $4)`,
          [userId, task2.id, currentProgress, today]
        );
      } else {
        const ut2 = ut2Res.rows[0];
        currentProgress = Math.min(task2.target_count, (ut2.current_progress || 0) + count);
        await client.query(
          'UPDATE user_tasks SET current_progress = $1 WHERE id = $2',
          [currentProgress, ut2.id]
        );
      }

      // Check daily_mission (task 3): requires login and roll_3_cards
      if (currentProgress >= task2.target_count) {
        const t3Res = await client.query("SELECT * FROM daily_tasks WHERE task_key = 'daily_mission'");
        if (t3Res.rowCount > 0) {
          const task3 = t3Res.rows[0];
          const ut3Res = await client.query(
            'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2 AND task_date = $3',
            [userId, task3.id, today]
          );
          if (ut3Res.rowCount === 0) {
            await client.query(
              `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date)
               VALUES ($1, $2, 1, false, $3)`,
              [userId, task3.id, today]
            );
          } else {
            await client.query('UPDATE user_tasks SET current_progress = 1 WHERE id = $1', [ut3Res.rows[0].id]);
          }
        }
      }
    }

    // Check mint_rare: if any minted card is Gold or above
    const hasRare = cards.some((c) =>
      ['Gold', 'Black Carbon', 'Titanium', 'Holographic'].includes(c.material)
    );
    if (hasRare) {
      await recordTaskProgress(client, userId, 'mint_rare', 1);
    }
  } catch (err) {
    console.error('Error tracking card issue task progress:', err);
  }
}

// GET /api/me — Profile & Balance
apiRouter.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

    // Auto-record login task progress
    await ensureDailyLoginTask({ query }, user.id);

    // Get active tasks progress
    const today = new Date().toISOString().slice(0, 10);
    const userTasksRes = await query(
      'SELECT * FROM user_tasks WHERE user_id = $1 AND task_date = $2',
      [user.id, today]
    );

    // Get free rolls stats
    const freeRollsRes = await query(
      'SELECT * FROM free_rolls WHERE user_id = $1 AND roll_date = $2',
      [user.id, today]
    );
    const freeRollData = freeRollsRes.rows[0] || { daily_count: 0, last_roll_at: null };

    // Seconds remaining for free roll cooldown (30s)
    let freeRollCooldownSeconds = 0;
    if (freeRollData.last_roll_at) {
      const elapsed = Math.floor((Date.now() - new Date(freeRollData.last_roll_at).getTime()) / 1000);
      if (elapsed < 30) {
        freeRollCooldownSeconds = 30 - elapsed;
      }
    }

    // Favorites
    const favRes = await query('SELECT card_id FROM user_favorites WHERE user_id = $1', [user.id]);
    const favorites = favRes.rows.map((r: any) => r.card_id);

    // Total unique cards count
    const cardsRes = await query(
      'SELECT COUNT(*) as count FROM cards WHERE user_id = $1 AND (is_sold IS NULL OR is_sold = false)',
      [user.id]
    );
    const totalCards = parseInt(cardsRes.rows[0]?.count || '0', 10);

    const completedTasksCount = userTasksRes.rows.filter((t: any) => t.is_claimed || t.current_progress >= 1).length;

    res.json({
      success: true,
      user: {
        id: user.id,
        telegramId: user.telegram_id,
        username: user.username,
        firstName: user.first_name,
        lastName: user.last_name,
        photoUrl: user.photo_url,
        coins: user.coins,
        level: user.level,
        exp: user.exp,
        prefix: user.prefix || null,
        totalCards,
        favorites,
        freeRollsToday: freeRollData.daily_count,
        maxFreeRolls: 150,
        freeRollCooldownSeconds,
        tasksProgress: `${completedTasksCount} из 3 заданий`,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/cards/issue — Roll Card by Tier (standard: 500, go: 1000, plus: 2000, elite: 5000)
apiRouter.post('/cards/issue', async (req: AuthenticatedRequest, res: Response) => {
  const { requestId, tier = 'standard' } = req.body;
  if (!requestId) {
    return res.status(400).json({ success: false, error: 'Missing requestId' });
  }

  const selectedTier = (tier in CASE_TIERS ? tier : 'standard') as CaseTier;
  const caseCost = CASE_TIERS[selectedTier]?.price || 500;

  try {
    const user = await getOrCreateUser(req.telegramUser);

    // 1. Check idempotency: if operation already succeeded, return stored result
    const existingOp = await query('SELECT * FROM operations WHERE request_id = $1', [requestId]);
    if (existingOp.rowCount > 0) {
      return res.json({
        success: true,
        isIdempotentReplay: true,
        ...existingOp.rows[0].response_payload,
      });
    }

    // 2. Atomic roll transaction
    const result = await withTransaction(async (client) => {
      // Re-check user balance with row lock
      const uRes = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
      const freshUser = uRes.rows[0];

      if (freshUser.coins < caseCost) {
        throw new Error(`Недостаточно средств: требуется ${caseCost} Coins`);
      }

      // Deduct coins
      const newBalance = freshUser.coins - caseCost;
      await client.query('UPDATE users SET coins = $1, exp = exp + 10 WHERE id = $2', [
        newBalance,
        user.id,
      ]);

      // Beginner roll check: first 10 rolls receive 0.5x luck
      const countRes = await client.query('SELECT COUNT(*) as count FROM cards WHERE user_id = $1', [
        user.id,
      ]);
      const rollsCount = parseInt(countRes.rows[0]?.count || '0', 10);
      const isBeginner = rollsCount < 10;

      // Generate card with case tier
      const generated = generateCard(false, isBeginner, selectedTier);
      const cardUid = 'card_' + crypto.randomBytes(12).toString('hex');

      const cardInsert = await client.query(
        `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          cardUid,
          user.id,
          generated.bank,
          generated.material,
          generated.category,
          generated.cardNumber,
          generated.collectionCode,
          generated.expiresAt,
          generated.collectorScore,
          false,
          generated.serialNumber,
        ]
      );
      const newCard = cardInsert.rows[0];

      // Save operation for idempotency
      const payload = {
        card: newCard,
        coinsRemaining: newBalance,
      };

      await client.query(
        `INSERT INTO operations (request_id, user_id, action_type, response_payload)
         VALUES ($1, $2, 'issue_card', $3)`,
        [requestId, user.id, JSON.stringify(payload)]
      );

      // Record daily task progress
      await recordCardIssueTaskProgress(client, user.id, 1, [newCard]);

      return payload;
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/cards/free-issue — BOMZH Free Roll
apiRouter.post('/cards/free-issue', async (req: AuthenticatedRequest, res: Response) => {
  const { requestId } = req.body;
  if (!requestId) {
    return res.status(400).json({ success: false, error: 'Missing requestId' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    // 1. Check idempotency
    const existingOp = await query('SELECT * FROM operations WHERE request_id = $1', [requestId]);
    if (existingOp.rowCount > 0) {
      return res.json({
        success: true,
        isIdempotentReplay: true,
        ...existingOp.rows[0].response_payload,
      });
    }

    // 2. Validate BOMZH requirements
    if (user.coins >= 500) {
      return res.status(400).json({
        success: false,
        error: 'Бесплатный режим «БОМЖ» доступен только при балансе менее 500 Coins',
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const frRes = await query(
      'SELECT * FROM free_rolls WHERE user_id = $1 AND roll_date = $2',
      [user.id, today]
    );
    const frData = frRes.rows[0];

    if (frData) {
      if (frData.daily_count >= 150) {
        return res.status(400).json({
          success: false,
          error: 'Достигнут суточный лимит 150 бесплатных выпусков',
        });
      }

      const elapsed = Math.floor((Date.now() - new Date(frData.last_roll_at).getTime()) / 1000);
      if (elapsed < 30) {
        return res.status(400).json({
          success: false,
          error: `Подождите еще ${30 - elapsed} сек. перед бесплатным выпуском`,
        });
      }
    }

    // 3. Atomic free roll transaction
    const result = await withTransaction(async (client) => {
      const generated = generateCard(true); // BOMZH probabilities (x0.1 luck)
      const cardUid = 'free_' + crypto.randomBytes(12).toString('hex');

      const cardInsert = await client.query(
        `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll, serial_number)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          cardUid,
          user.id,
          generated.bank,
          generated.material,
          generated.category,
          generated.cardNumber,
          generated.collectionCode,
          generated.expiresAt,
          generated.collectorScore,
          true,
          generated.serialNumber,
        ]
      );
      const newCard = cardInsert.rows[0];

      // Update free_rolls record
      const newCount = (frData?.daily_count || 0) + 1;
      const nowIso = new Date().toISOString();
      await client.query(
        `INSERT INTO free_rolls (user_id, roll_date, daily_count, last_roll_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, roll_date)
         DO UPDATE SET daily_count = $3, last_roll_at = $4`,
        [user.id, today, newCount, nowIso]
      );

      const payload = {
        card: newCard,
        freeRollsUsed: newCount,
        freeRollsLeft: 150 - newCount,
        coinsRemaining: user.coins,
      };

      await client.query(
        `INSERT INTO operations (request_id, user_id, action_type, response_payload)
         VALUES ($1, $2, 'free_issue_card', $3)`,
        [requestId, user.id, JSON.stringify(payload)]
      );

      // Record daily task progress
      await recordCardIssueTaskProgress(client, user.id, 1, [newCard]);

      return payload;
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/cards/auto-issue — Auto-Roll (up to 100 spins, accelerated, stops on insufficient funds)
apiRouter.post('/cards/auto-issue', async (req: AuthenticatedRequest, res: Response) => {
  const { count, requestId, tier = 'standard' } = req.body;
  const requestedSpins = Math.min(Math.max(parseInt(count || '1', 10), 1), 100);
  const selectedTier = (tier in CASE_TIERS ? tier : 'standard') as CaseTier;
  const caseCost = CASE_TIERS[selectedTier]?.price || 500;

  try {
    const user = await getOrCreateUser(req.telegramUser);

    if (user.coins < caseCost) {
      return res.status(400).json({
        success: false,
        error: `Недостаточно средств (нужно ${caseCost} Coins)`,
        stoppedReason: 'INSUFFICIENT_FUNDS',
        spinsCompleted: 0,
        cards: [],
      });
    }

    const result = await withTransaction(async (client) => {
      // Re-read user
      const uRes = await client.query('SELECT * FROM users WHERE id = $1', [user.id]);
      let currentCoins = uRes.rows[0].coins;

      const generatedCards: any[] = [];
      let completedSpins = 0;

      const countRes = await client.query('SELECT COUNT(*) as count FROM cards WHERE user_id = $1', [
        user.id,
      ]);
      const baseRollsCount = parseInt(countRes.rows[0]?.count || '0', 10);

      for (let i = 0; i < requestedSpins; i++) {
        if (currentCoins < caseCost) {
          break;
        }

        currentCoins -= caseCost;
        completedSpins++;

        const isBeginner = (baseRollsCount + completedSpins) <= 10;
        const generated = generateCard(false, isBeginner, selectedTier, true);
        const cardUid = 'auto_' + crypto.randomBytes(12).toString('hex');

        const cardInsert = await client.query(
          `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll, serial_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            cardUid,
            user.id,
            generated.bank,
            generated.material,
            generated.category,
            generated.cardNumber,
            generated.collectionCode,
            generated.expiresAt,
            generated.collectorScore,
            false,
            generated.serialNumber,
          ]
        );
        generatedCards.push(cardInsert.rows[0]);
      }

      // Update user coins & exp
      await client.query('UPDATE users SET coins = $1, exp = exp + $2 WHERE id = $3', [
        currentCoins,
        completedSpins * 10,
        user.id,
      ]);

      const stoppedReason =
        completedSpins < requestedSpins ? 'Недостаточно средств' : 'COMPLETED';

      const payload = {
        requestedSpins,
        spinsCompleted: completedSpins,
        stoppedReason,
        coinsRemaining: currentCoins,
        cards: generatedCards,
      };

      if (requestId) {
        await client.query(
          `INSERT INTO operations (request_id, user_id, action_type, response_payload)
           VALUES ($1, $2, 'auto_issue', $3)
           ON CONFLICT (request_id) DO NOTHING`,
          [requestId, user.id, JSON.stringify(payload)]
        );
      }

      // Record daily task progress
      if (completedSpins > 0) {
        await recordCardIssueTaskProgress(client, user.id, completedSpins, generatedCards);
      }

      return payload;
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/cards — Paginated Collection with Filters & Grouping
apiRouter.get('/cards', async (req: AuthenticatedRequest, res: Response) => {
  const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
  const limit = Math.min(parseInt((req.query.limit as string) || '40', 10), 200);
  const bank = req.query.bank as BankName | undefined;
  const material = req.query.material as MaterialName | undefined;
  const category = req.query.category as CategoryName | undefined;
  const viewMode = (req.query.view as string) || 'templates'; // 'templates' or 'all'

  try {
    const user = await getOrCreateUser(req.telegramUser);

    const queryParams: any[] = [user.id];
    let sql = 'SELECT * FROM cards WHERE user_id = $1 AND (is_sold IS NULL OR is_sold = false)';

    if (bank) {
      queryParams.push(bank);
      sql += ` AND bank = $${queryParams.length}`;
    }
    if (material) {
      queryParams.push(material);
      sql += ` AND material = $${queryParams.length}`;
    }
    if (category) {
      queryParams.push(category);
      sql += ` AND category = $${queryParams.length}`;
    }

    sql += ' ORDER BY created_at DESC';

    const cardsRes = await query(sql, queryParams);
    const allMatching = cardsRes.rows;

    if (viewMode === 'templates') {
      // Group cards by template key: Bank | Material | Category
      const templateGroups: Record<string, { templateKey: string; bank: string; material: string; category: string; count: number; sampleCard: any }> = {};

      for (const card of allMatching) {
        const key = `${card.bank}|${card.material}|${card.category}`;
        if (!templateGroups[key]) {
          templateGroups[key] = {
            templateKey: key,
            bank: card.bank,
            material: card.material,
            category: card.category,
            count: 1,
            sampleCard: card,
          };
        } else {
          templateGroups[key].count++;
        }
      }

      const groupsList = Object.values(templateGroups);
      const totalGroups = groupsList.length;
      const startIndex = (page - 1) * limit;
      const paginatedGroups = groupsList.slice(startIndex, startIndex + limit);

      return res.json({
        success: true,
        viewMode: 'templates',
        page,
        limit,
        totalItems: totalGroups,
        totalPages: Math.ceil(totalGroups / limit),
        items: paginatedGroups,
      });
    }

    // View mode: 'all'
    const totalItems = allMatching.length;
    const startIndex = (page - 1) * limit;
    const paginatedCards = allMatching.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      viewMode: 'all',
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit),
      items: paginatedCards,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/cards/:id — Card Details
apiRouter.get('/cards/:id', async (req: AuthenticatedRequest, res: Response) => {
  const cardId = req.params.id;

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const cardRes = await query(
      'SELECT * FROM cards WHERE (id = $1 OR card_uid = $1) AND user_id = $2',
      [cardId, user.id]
    );

    if (cardRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Карта не найдена' });
    }

    res.json({ success: true, card: cardRes.rows[0] });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/favorites/:cardId — Add to favorites (max 5)
apiRouter.post('/favorites/:cardId', async (req: AuthenticatedRequest, res: Response) => {
  const cardId = parseInt(req.params.cardId, 10);

  try {
    const user = await getOrCreateUser(req.telegramUser);

    // Check count of existing favorites
    const favCountRes = await query('SELECT COUNT(*) as count FROM user_favorites WHERE user_id = $1', [
      user.id,
    ]);
    const currentCount = parseInt(favCountRes.rows[0]?.count || '0', 10);

    if (currentCount >= 5) {
      return res.status(400).json({ success: false, error: 'Максимум 5 избранных карт' });
    }

    // Verify card ownership
    const cardCheck = await query('SELECT id FROM cards WHERE id = $1 AND user_id = $2', [
      cardId,
      user.id,
    ]);
    if (cardCheck.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Карта не найдена в вашей коллекции' });
    }

    await query(
      'INSERT INTO user_favorites (user_id, card_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.id, cardId]
    );

    res.json({ success: true, message: 'Добавлено в избранное' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/favorites/:cardId — Remove from favorites
apiRouter.delete('/favorites/:cardId', async (req: AuthenticatedRequest, res: Response) => {
  const cardId = parseInt(req.params.cardId, 10);

  try {
    const user = await getOrCreateUser(req.telegramUser);
    await query('DELETE FROM user_favorites WHERE user_id = $1 AND card_id = $2', [user.id, cardId]);
    res.json({ success: true, message: 'Удалено из избранного' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/tasks — Daily Tasks & Status
apiRouter.get('/tasks', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const today = new Date().toISOString().slice(0, 10);

    // Auto-record login task
    await ensureDailyLoginTask({ query }, user.id);

    const allTasksRes = await query('SELECT * FROM daily_tasks ORDER BY id ASC');
    const userTasksRes = await query(
      'SELECT * FROM user_tasks WHERE user_id = $1 AND task_date = $2',
      [user.id, today]
    );

    const userTaskMap = new Map(userTasksRes.rows.map((ut: any) => [ut.task_id, ut]));

    const tasks = allTasksRes.rows.map((task: any) => {
      const ut = userTaskMap.get(task.id);
      const isLogin = task.task_key === 'daily_login';
      const progress = ut ? ut.current_progress : (isLogin ? 1 : 0);
      const isClaimed = ut ? ut.is_claimed : false;
      return {
        id: task.id,
        taskKey: task.task_key,
        title: task.title,
        rewardCoins: task.reward_coins,
        targetCount: task.target_count,
        currentProgress: progress,
        isClaimed,
        canClaim: progress >= task.target_count && !isClaimed,
      };
    });

    res.json({ success: true, tasks });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks/progress — Record custom action progress (e.g. share_card)
apiRouter.post('/tasks/progress', async (req: AuthenticatedRequest, res: Response) => {
  const { taskKey, amount } = req.body;
  if (!taskKey) {
    return res.status(400).json({ success: false, error: 'taskKey обязателен' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);
    await withTransaction(async (client) => {
      await recordTaskProgress(client, user.id, taskKey, amount || 1);
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/tasks/:id/claim — Claim task reward
apiRouter.post('/tasks/:id/claim', async (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const today = new Date().toISOString().slice(0, 10);

    const taskRes = await query('SELECT * FROM daily_tasks WHERE id = $1', [taskId]);
    if (taskRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Задание не найдено' });
    }
    const task = taskRes.rows[0];

    const result = await withTransaction(async (client) => {
      let utRes = await client.query(
        'SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = $2 AND task_date = $3',
        [user.id, taskId, today]
      );

      // If user hasn't started or reached target, auto-complete daily login if it's login task
      if (utRes.rowCount === 0 && task.task_key === 'daily_login') {
        utRes = await client.query(
          `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date)
           VALUES ($1, $2, 1, false, $3) RETURNING *`,
          [user.id, taskId, today]
        );
      }

      // If task is daily_mission, check if both login & roll_3_cards are completed
      if (task.task_key === 'daily_mission' && utRes.rowCount === 0) {
        const otherRes = await client.query(
          'SELECT * FROM user_tasks WHERE user_id = $1 AND task_date = $2',
          [user.id, today]
        );
        const loginDone = otherRes.rows.some((t: any) => t.task_id === 1 && (t.is_claimed || t.current_progress >= 1));
        const rollsDone = otherRes.rows.some((t: any) => t.task_id === 2 && (t.is_claimed || t.current_progress >= 3));
        if (loginDone && rollsDone) {
          utRes = await client.query(
            `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date)
             VALUES ($1, $2, 1, false, $3) RETURNING *`,
            [user.id, taskId, today]
          );
        }
      }

      const ut = utRes.rows[0];
      if (!ut || ut.current_progress < task.target_count) {
        throw new Error('Задание еще не выполнено');
      }

      if (ut.is_claimed) {
        throw new Error('Награда уже получена сегодня');
      }

      // Mark claimed and add coins
      await client.query('UPDATE user_tasks SET is_claimed = true WHERE id = $1', [ut.id]);
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [
        task.reward_coins,
        user.id,
      ]);

      return {
        claimedCoins: task.reward_coins,
        taskId: task.id,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/shop — Telegram Stars Cosmetics Catalog
apiRouter.get('/shop', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const catalogRes = await query('SELECT * FROM cosmetic_items ORDER BY price_stars ASC');
    const ownedRes = await query('SELECT item_id FROM user_cosmetics WHERE user_id = $1', [user.id]);
    const ownedIds = new Set(ownedRes.rows.map((r: any) => r.item_id));

    const items = catalogRes.rows.map((item: any) => ({
      ...item,
      isOwned: ownedIds.has(item.id),
    }));

    res.json({ success: true, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/payments/stars/create — Create Invoice / Purchase Flow
apiRouter.post('/payments/stars/create', async (req: AuthenticatedRequest, res: Response) => {
  const { itemId } = req.body;

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const itemRes = await query('SELECT * FROM cosmetic_items WHERE id = $1', [itemId]);

    if (itemRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Товар не найден' });
    }
    const item = itemRes.rows[0];

    // Check if already owned
    const owned = await query(
      'SELECT id FROM user_cosmetics WHERE user_id = $1 AND item_id = $2',
      [user.id, item.id]
    );
    if (owned.rowCount > 0) {
      return res.status(400).json({ success: false, error: 'Этот предмет уже куплен вами' });
    }

    const chargeId = 'charge_' + crypto.randomBytes(12).toString('hex');

    // Create record in star_payments
    await query(
      `INSERT INTO star_payments (payment_charge_id, user_id, item_id, stars_amount, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [chargeId, user.id, item.id, item.price_stars]
    );

    let invoiceUrl: string | null = null;
    let isDev = false;

    if (process.env.BOT_TOKEN) {
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/createInvoiceLink`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.name,
            description: item.description || `Косметический предмет ${item.name}`,
            payload: chargeId,
            provider_token: '', // Required empty string for Telegram Stars (XTR)
            currency: 'XTR',
            prices: [{ label: item.name, amount: item.price_stars }],
          }),
        });
        const tgData = (await tgRes.json()) as any;
        if (tgData.ok && tgData.result) {
          invoiceUrl = tgData.result;
        } else {
          console.warn('[Stars Payment] createInvoiceLink returned non-ok:', tgData);
          isDev = true;
        }
      } catch (tgErr) {
        console.warn('[Stars Payment] failed to request Telegram Bot API:', tgErr);
        isDev = true;
      }
    } else {
      isDev = true;
    }

    res.json({
      success: true,
      chargeId,
      currency: 'XTR',
      amount: item.price_stars,
      title: item.name,
      description: item.description,
      isDevTestMode: isDev || !invoiceUrl,
      invoiceUrl,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/payments/stars/webhook — Confirm Telegram Stars Payment
apiRouter.post('/payments/stars/webhook', async (req: AuthenticatedRequest, res: Response) => {
  const { chargeId, telegramPaymentChargeId, mockConfirm } = req.body;

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const paymentRes = await query('SELECT * FROM star_payments WHERE payment_charge_id = $1', [
      chargeId,
    ]);

    if (paymentRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Платеж не найден' });
    }
    const payment = paymentRes.rows[0];

    if (payment.status === 'completed') {
      return res.json({ success: true, message: 'Платеж уже обработан ранее', itemAlreadyGranted: true });
    }

    // Atomic fulfillment
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE star_payments
         SET status = 'completed', telegram_payment_charge_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [telegramPaymentChargeId || (mockConfirm ? 'MOCK_CONFIRMED' : 'STARS_RECEIPT'), payment.id]
      );

      await client.query(
        `INSERT INTO user_cosmetics (user_id, item_id, is_equipped)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id, item_id) DO NOTHING`,
        [user.id, payment.item_id]
      );
    });

    res.json({ success: true, message: 'Покупка успешно активирована!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/albums — Albums and Progress
apiRouter.get('/albums', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const albumsRes = await query('SELECT * FROM albums ORDER BY id ASC');
    const cardsRes = await query(
      'SELECT bank, material, category FROM cards WHERE user_id = $1 AND (is_sold IS NULL OR is_sold = false)',
      [user.id]
    );

    const banksSet = new Set(cardsRes.rows.map((c: any) => c.bank));
    const matsSet = new Set(cardsRes.rows.map((c: any) => c.material));
    const rareCount = cardsRes.rows.filter((c: any) =>
      ['Triple', 'Quad', 'Mirror'].includes(c.category)
    ).length;

    const albums = albumsRes.rows.map((album: any) => {
      let progress = 0;
      if (album.category === 'banks') progress = banksSet.size;
      else if (album.category === 'materials') progress = matsSet.size;
      else if (album.category === 'rarities') progress = rareCount;

      const isCompleted = progress >= album.required_count;
      return {
        ...album,
        progress: Math.min(progress, album.required_count),
        isCompleted,
      };
    });

    res.json({ success: true, albums });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// AVITA MERCHANT ROUTES
// ==========================================

// GET /api/avita/status — Cooldown status & active session
apiRouter.get('/avita/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

    let isBlocked = false;
    let secondsRemaining = 0;
    if (user.avita_blocked_until) {
      const blockedDate = new Date(user.avita_blocked_until).getTime();
      const now = Date.now();
      if (blockedDate > now) {
        isBlocked = true;
        secondsRemaining = Math.max(0, Math.ceil((blockedDate - now) / 1000));
      }
    }

    res.json({
      success: true,
      isBlocked,
      blockedUntil: user.avita_blocked_until,
      secondsRemaining,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/avita/quote — Start negotiation for single card or batch
apiRouter.post('/avita/quote', async (req: AuthenticatedRequest, res: Response) => {
  const { cardIds } = req.body;
  if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Выберите хотя бы одну карту для оценки' });
  }
  if (cardIds.length > 200) {
    return res.status(400).json({ success: false, error: 'Максимум 200 карт за одну сделку' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    // 1. Check if user is blocked by Avita (120s cooldown)
    if (user.avita_blocked_until) {
      const blockedDate = new Date(user.avita_blocked_until).getTime();
      const now = Date.now();
      if (blockedDate > now) {
        const remaining = Math.max(1, Math.ceil((blockedDate - now) / 1000));
        return res.status(403).json({
          success: false,
          error: `Авита пока не хочет с вами разговаривать. Подождите ещё ${remaining} сек.`,
          secondsRemaining: remaining,
        });
      }
    }

    // 2. Fetch cards
    const numericIds = cardIds.map((id: any) => parseInt(id, 10)).filter((id: number) => !isNaN(id));
    const cardsRes = await query('SELECT * FROM cards WHERE id = ANY($1)', [numericIds]);
    const cards = cardsRes.rows.filter((c: any) => c.user_id === user.id && !c.is_sold);

    if (cards.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Выбранные карты не найдены в вашей коллекции или уже проданы',
      });
    }

    // 3. Free Roll Card Check (BOMZH Mode rejection rule)
    const hasFreeRoll = cards.some((c: any) => c.is_free_roll);
    if (hasFreeRoll) {
      return res.status(400).json({
        success: false,
        error: 'Эту карту я не покупаю. Она получена в бесплатном режиме и не предназначена для продажи.',
      });
    }

    // 3.1 Market Listing Check
    const hasListedOnMarket = cards.some((c: any) => c.is_listed_on_market);
    if (hasListedOnMarket) {
      return res.status(400).json({
        success: false,
        error: 'Одна или несколько карт выставлены на продажу на Рынке. Снимите их с продажи перед сдачей скупщику.',
      });
    }

    // 4. Batch/Single Valuation
    const batchEval = evaluateBatchCards(cards);
    if (batchEval.evaluations.length === 0) {
      return res.status(400).json({ success: false, error: 'Нет доступных для продажи карт' });
    }

    const greeting = generateInitialGreeting(cards, batchEval.totalInitial);
    const sessionId = 'avita_' + crypto.randomBytes(8).toString('hex');
    const validCardIds = batchEval.evaluations.map((e) => e.cardId);

    const dialogHistory = [
      {
        sender: 'avita',
        message: greeting,
        timestamp: new Date().toISOString(),
      },
    ];

    // Store active session
    await query(
      `INSERT INTO avita_sessions (session_id, user_id, card_ids, initial_offer, current_offer, max_offer, rounds_used, status, dialog_history)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'active', $7)`,
      [
        sessionId,
        user.id,
        JSON.stringify(validCardIds),
        batchEval.totalInitial,
        batchEval.totalInitial,
        batchEval.totalMax,
        JSON.stringify(dialogHistory),
      ]
    );

    res.json({
      success: true,
      session: {
        sessionId,
        cards,
        initialOffer: batchEval.totalInitial,
        currentOffer: batchEval.totalInitial,
        maxOffer: batchEval.totalMax,
        roundsUsed: 0,
        dialogHistory,
        isLastRound: false,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/avita/bargain — Bargaining Round (Max 3 rounds)
apiRouter.post('/avita/bargain', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId, playerDemand } = req.body;
  if (!sessionId || typeof playerDemand !== 'number') {
    return res.status(400).json({ success: false, error: 'Не указан sessionId или сумма торга' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    // Check cooldown
    if (user.avita_blocked_until) {
      const blockedDate = new Date(user.avita_blocked_until).getTime();
      const now = Date.now();
      if (blockedDate > now) {
        const remaining = Math.max(1, Math.ceil((blockedDate - now) / 1000));
        return res.status(403).json({
          success: false,
          error: `Авита обиделся и не торгуется. Подождите ещё ${remaining} сек.`,
          secondsRemaining: remaining,
        });
      }
    }

    const sessionRes = await query('SELECT * FROM avita_sessions WHERE session_id = $1', [sessionId]);
    if (sessionRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Сессия торга не найдена' });
    }
    const session = sessionRes.rows[0];

    if (session.user_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Доступ запрещен' });
    }

    if (session.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: `Сессия уже завершена со статусом: ${session.status}`,
      });
    }

    const currentRound = (session.rounds_used || 0) + 1;
    const bargainResult = processBargainRound({
      currentOffer: session.current_offer,
      maxOffer: session.max_offer,
      playerDemand: Math.round(playerDemand),
      round: currentRound,
    });

    const parsedHistory =
      typeof session.dialog_history === 'string'
        ? JSON.parse(session.dialog_history)
        : session.dialog_history || [];

    parsedHistory.push({
      sender: 'player',
      message: `Слишком мало. Давай ${Math.round(playerDemand).toLocaleString()} Coins.`,
      timestamp: new Date().toISOString(),
    });

    parsedHistory.push({
      sender: 'avita',
      message: bargainResult.avitaReply,
      timestamp: new Date().toISOString(),
    });

    let newStatus = session.status;
    let blockedUntil: string | null = null;
    let secondsRemaining = 0;

    if (bargainResult.rejected) {
      // 120-second cooldown saved in database!
      newStatus = 'rejected';
      const blockedDate = new Date(Date.now() + 120 * 1000);
      blockedUntil = blockedDate.toISOString();
      secondsRemaining = 120;

      await query('UPDATE users SET avita_blocked_until = $1 WHERE id = $2', [blockedUntil, user.id]);
    } else if (bargainResult.accepted) {
      newStatus = 'accepted';
    }

    await query(
      `UPDATE avita_sessions
       SET current_offer = $1, rounds_used = $2, status = $3, dialog_history = $4, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $5`,
      [bargainResult.newOffer, currentRound, newStatus, JSON.stringify(parsedHistory), sessionId]
    );

    res.json({
      success: true,
      accepted: bargainResult.accepted,
      rejected: bargainResult.rejected,
      isBlocked: bargainResult.rejected,
      blockedUntil,
      secondsRemaining,
      newOffer: bargainResult.newOffer,
      roundsUsed: currentRound,
      isLastRound: bargainResult.isLastRound,
      dialogHistory: parsedHistory,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/avita/accept — Confirm Sale & Earn Coins
apiRouter.post('/avita/accept', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Не указан sessionId' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const sessionRes = await query('SELECT * FROM avita_sessions WHERE session_id = $1', [sessionId]);

    if (sessionRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Сессия не найдена' });
    }
    const session = sessionRes.rows[0];

    if (session.user_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Доступ запрещен' });
    }

    if (!['active', 'accepted'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        error: 'Эта сделка уже закрыта, отменена или отклонена',
      });
    }

    const cardIds: number[] =
      typeof session.card_ids === 'string'
        ? JSON.parse(session.card_ids)
        : session.card_ids;

    const result = await withTransaction(async (client) => {
      // Re-verify cards ownership
      const cardsRes = await client.query('SELECT * FROM cards WHERE id = ANY($1)', [cardIds]);
      const validCards = cardsRes.rows.filter((c: any) => c.user_id === user.id && !c.is_sold);

      if (validCards.length === 0) {
        throw new Error('Карты уже проданы или не найдены в коллекции');
      }

      const finalPrice = session.current_offer;

      // Mark cards as sold
      await client.query(
        'UPDATE cards SET is_sold = true, sold_price = $1, sold_at = CURRENT_TIMESTAMP WHERE id = ANY($2)',
        [Math.round(finalPrice / validCards.length), cardIds]
      );

      // Clean up favorites
      await client.query(
        'DELETE FROM user_favorites WHERE user_id = $1 AND card_id = ANY($2)',
        [user.id, cardIds]
      );

      // Add coins to user
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [finalPrice, user.id]);

      // Update session status
      const parsedHistory =
        typeof session.dialog_history === 'string'
          ? JSON.parse(session.dialog_history)
          : session.dialog_history || [];

      parsedHistory.push({
        sender: 'avita',
        message: `По рукам! Сделка успешно завершена. Забирай свои ${finalPrice.toLocaleString()} Coins.`,
        timestamp: new Date().toISOString(),
      });

      await client.query(
        `UPDATE avita_sessions
         SET status = 'completed', dialog_history = $1, updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $2`,
        [JSON.stringify(parsedHistory), sessionId]
      );

      // Record deal
      const dealId = 'deal_' + crypto.randomBytes(8).toString('hex');
      const cardsSummary = validCards.map((c: any) => ({
        id: c.id,
        bank: c.bank,
        material: c.material,
        category: c.category,
        cardNumber: c.card_number,
      }));

      await client.query(
        `INSERT INTO avita_deals (deal_id, user_id, card_count, cards_summary, final_price, status)
         VALUES ($1, $2, $3, $4, $5, 'completed')`,
        [dealId, user.id, validCards.length, JSON.stringify(cardsSummary), finalPrice]
      );

      // Track sell_avita daily task
      await recordTaskProgress(client, user.id, 'sell_avita', 1);

      return {
        coinsEarned: finalPrice,
        cardsSold: validCards.length,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/avita/cancel — Walk away peacefully (No 120s cooldown!)
apiRouter.post('/avita/cancel', async (req: AuthenticatedRequest, res: Response) => {
  const { sessionId } = req.body;
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Не указан sessionId' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const sessionRes = await query('SELECT * FROM avita_sessions WHERE session_id = $1', [sessionId]);

    if (sessionRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Сессия не найдена' });
    }
    const session = sessionRes.rows[0];

    if (session.user_id !== user.id) {
      return res.status(403).json({ success: false, error: 'Доступ запрещен' });
    }

    const parsedHistory =
      typeof session.dialog_history === 'string'
        ? JSON.parse(session.dialog_history)
        : session.dialog_history || [];

    parsedHistory.push({
      sender: 'player',
      message: 'Отказаться',
      timestamp: new Date().toISOString(),
    });

    parsedHistory.push({
      sender: 'avita',
      message: 'Как знаешь. Карта остаётся у тебя.',
      timestamp: new Date().toISOString(),
    });

    await query(
      `UPDATE avita_sessions
       SET status = 'cancelled', dialog_history = $1, updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $2`,
      [JSON.stringify(parsedHistory), sessionId]
    );

    res.json({
      success: true,
      message: 'Как знаешь. Карта остаётся у тебя.',
      dialogHistory: parsedHistory,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/avita/history — Past completed deals
apiRouter.get('/avita/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const dealsRes = await query(
      'SELECT * FROM avita_deals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
      [user.id]
    );

    res.json({
      success: true,
      deals: dealsRes.rows.map((d: any) => ({
        id: d.id,
        dealId: d.deal_id,
        cardCount: d.card_count,
        cardsSummary:
          typeof d.cards_summary === 'string' ? JSON.parse(d.cards_summary) : d.cards_summary,
        finalPrice: d.final_price,
        status: d.status,
        createdAt: d.created_at,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// CLICKER / EARN COINS API ENDPOINTS
// ==========================================

// GET /api/clicker/state — Get user clicker energy, upgrades and daily help status
apiRouter.get('/clicker/state', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

    let clickerRes = await query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
    if (clickerRes.rowCount === 0) {
      clickerRes = await query(
        `INSERT INTO user_clicker (user_id, power_level, recharge_level, current_energy, last_energy_updated_at, total_clicks)
         VALUES ($1, 1, 1, 100, CURRENT_TIMESTAMP, 0)
         RETURNING *`,
        [user.id]
      );
    }
    const clicker = clickerRes.rows[0] || {
      power_level: 1,
      recharge_level: 1,
      current_energy: 100,
      last_energy_updated_at: new Date().toISOString(),
      last_daily_help_at: null,
      total_clicks: 0,
    };

    const powerLevel = clicker.power_level || 1;
    const rechargeLevel = clicker.recharge_level || 1;
    const storedEnergy = typeof clicker.current_energy === 'number' ? clicker.current_energy : 100;
    const lastIso = clicker.last_energy_updated_at || new Date().toISOString();

    const energyCalc = calculateCurrentEnergy(storedEnergy, lastIso, rechargeLevel);

    // If energy recovered, update in database
    if (energyCalc.currentEnergy !== storedEnergy) {
      await query(
        'UPDATE user_clicker SET current_energy = $1, last_energy_updated_at = $2 WHERE user_id = $3',
        [energyCalc.currentEnergy, energyCalc.lastUpdatedIso, user.id]
      );
    }

    // Daily help cooldown check
    let canClaimDailyHelp = user.coins < 500;
    let dailyHelpSecondsRemaining = 0;
    if (clicker.last_daily_help_at) {
      const elapsed = Date.now() - new Date(clicker.last_daily_help_at).getTime();
      if (elapsed < DAILY_HELP_COOLDOWN_MS) {
        canClaimDailyHelp = false;
        dailyHelpSecondsRemaining = Math.ceil((DAILY_HELP_COOLDOWN_MS - elapsed) / 1000);
      }
    }

    const nextPowerLevel = powerLevel < MAX_LEVEL ? powerLevel + 1 : null;
    const nextPowerCost = nextPowerLevel ? CLICKER_CONFIG.powerUpgradeCosts[nextPowerLevel] : null;

    const nextRechargeLevel = rechargeLevel < MAX_LEVEL ? rechargeLevel + 1 : null;
    const nextRechargeCost = nextRechargeLevel ? CLICKER_CONFIG.rechargeUpgradeCosts[nextRechargeLevel] : null;
    const secondsPerUnit = CLICKER_CONFIG.rechargeSecondsPerUnit[rechargeLevel] || 30;

    const stateObj = {
      coins: user.coins,
      energy: energyCalc.currentEnergy,
      maxEnergy: MAX_ENERGY,
      energyPerSec: secondsPerUnit,
      powerLevel,
      energyLevel: rechargeLevel,
      powerCoinsPerTap: powerLevel,
      nextPowerCost,
      nextPowerCoinsPerTap: nextPowerLevel,
      nextEnergyCost: nextRechargeCost,
      nextEnergySec: nextRechargeLevel ? CLICKER_CONFIG.rechargeSecondsPerUnit[nextRechargeLevel] : null,
      totalTaps: clicker.total_clicks || 0,
      canClaimDailyHelp,
      dailyHelpCoins: DAILY_HELP_AMOUNT,
      tasks: (() => {
        const claimedList: string[] = Array.isArray(clicker.claimed_tasks)
          ? clicker.claimed_tasks
          : typeof clicker.claimed_tasks === 'string'
          ? JSON.parse(clicker.claimed_tasks)
          : [];

        return CLICKER_TASKS.map((t) => {
          let currentProgress = 0;
          let isCompleted = false;

          if (t.id === 'daily_enter') {
            currentProgress = 1;
            isCompleted = true;
          } else if (t.id === 'buy_upgrade') {
            const hasUpgraded = powerLevel > 1 || rechargeLevel > 1;
            currentProgress = hasUpgraded ? 1 : 0;
            isCompleted = hasUpgraded;
          } else if (t.type === 'clicks') {
            const total = clicker.total_clicks || 0;
            currentProgress = Math.min(t.targetCount, total);
            isCompleted = total >= t.targetCount;
          }

          const isClaimed = claimedList.includes(t.id);
          return {
            id: t.id,
            title: t.title,
            desc: t.description,
            rewardCoins: t.reward,
            targetCount: t.targetCount,
            currentProgress,
            isCompleted,
            isClaimed,
            canClaim: isCompleted && !isClaimed,
          };
        });
      })(),
    };

    res.json({
      success: true,
      state: stateObj,
      ...stateObj,
      currentEnergy: energyCalc.currentEnergy,
      coinsPerClick: powerLevel,
      rechargeLevel,
      secondsPerUnit,
      secondsUntilNextEnergy: energyCalc.secondsUntilNextEnergy,
      totalClicks: clicker.total_clicks || 0,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/clicker/tap — Process tap batch with anti-fraud energy validation
apiRouter.post('/clicker/tap', async (req: AuthenticatedRequest, res: Response) => {
  const { count = 1 } = req.body;
  const requestedTaps = Math.min(Math.max(parseInt(count || '1', 10), 1), 50);

  try {
    const user = await getOrCreateUser(req.telegramUser);

    const result = await withTransaction(async (client) => {
      let cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
      if (cRes.rowCount === 0) {
        cRes = await client.query(
          `INSERT INTO user_clicker (user_id, power_level, recharge_level, current_energy, last_energy_updated_at, total_clicks)
           VALUES ($1, 1, 1, 100, CURRENT_TIMESTAMP, 0)
           RETURNING *`,
          [user.id]
        );
      }
      const clicker = cRes.rows[0];

      const powerLevel = clicker.power_level || 1;
      const rechargeLevel = clicker.recharge_level || 1;
      const storedEnergy = typeof clicker.current_energy === 'number' ? clicker.current_energy : 100;
      const lastIso = clicker.last_energy_updated_at || new Date().toISOString();

      // Recalculate up-to-date energy
      const energyCalc = calculateCurrentEnergy(storedEnergy, lastIso, rechargeLevel);

      // Validate tap batch against current energy
      const tapResult = validateTapBatch({
        tapsCount: requestedTaps,
        powerLevel,
        currentEnergy: energyCalc.currentEnergy,
      });

      if (tapResult.allowedTaps <= 0) {
        return {
          tapsProcessed: 0,
          coinsEarned: 0,
          earnedCoins: 0,
          energy: energyCalc.currentEnergy,
          currentEnergy: energyCalc.currentEnergy,
          maxEnergy: MAX_ENERGY,
          coins: user.coins,
          userCoins: user.coins,
          totalTaps: clicker.total_clicks || 0,
          message: 'Недостаточно энергии для тапа',
        };
      }

      // Update energy and total clicks
      const nowIso = new Date().toISOString();
      await client.query(
        `UPDATE user_clicker
         SET current_energy = $1, last_energy_updated_at = $2, total_clicks = total_clicks + ${tapResult.allowedTaps}
         WHERE user_id = $3`,
        [tapResult.remainingEnergy, nowIso, user.id]
      );

      // Award Coins to user
      const uRes = await client.query(
        'UPDATE users SET coins = coins + $1, exp = exp + $2 WHERE id = $3 RETURNING coins',
        [tapResult.coinsEarned, Math.ceil(tapResult.allowedTaps / 2), user.id]
      );
      const newCoins = uRes.rows[0].coins;

      // Track clicker daily task
      await recordTaskProgress(client, user.id, 'clicker_50', tapResult.allowedTaps);

      return {
        tapsProcessed: tapResult.allowedTaps,
        coinsEarned: tapResult.coinsEarned,
        earnedCoins: tapResult.coinsEarned,
        energy: tapResult.remainingEnergy,
        currentEnergy: tapResult.remainingEnergy,
        maxEnergy: MAX_ENERGY,
        coins: newCoins,
        userCoins: newCoins,
        totalTaps: (clicker.total_clicks || 0) + tapResult.allowedTaps,
        tapsToday: (clicker.total_clicks || 0) + tapResult.allowedTaps,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/clicker/upgrade-power — Upgrade click power (1 -> 5 levels)
apiRouter.post('/clicker/upgrade-power', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

    const result = await withTransaction(async (client) => {
      let cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
      if (cRes.rowCount === 0) {
        cRes = await client.query(
          `INSERT INTO user_clicker (user_id, power_level, recharge_level, current_energy, last_energy_updated_at, total_clicks)
           VALUES ($1, 1, 1, 100, CURRENT_TIMESTAMP, 0)
           RETURNING *`,
          [user.id]
        );
      }
      const clicker = cRes.rows[0];
      const currentPower = clicker.power_level || 1;

      if (currentPower >= MAX_LEVEL) {
        throw new Error('Достигнут максимальный уровень силы клика (5)');
      }

      const nextLevel = currentPower + 1;
      const cost = CLICKER_CONFIG.powerUpgradeCosts[nextLevel];

      const uRes = await client.query('SELECT coins FROM users WHERE id = $1', [user.id]);
      const userCoins = uRes.rows[0].coins;

      if (userCoins < cost) {
        throw new Error(`Недостаточно Coins. Требуется ${cost} Coins`);
      }

      // Deduct coins & update power level
      await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [cost, user.id]);
      await client.query('UPDATE user_clicker SET power_level = $1 WHERE user_id = $2', [
        nextLevel,
        user.id,
      ]);

      const updatedCoins = userCoins - cost;
      const nextCost = nextLevel < MAX_LEVEL ? CLICKER_CONFIG.powerUpgradeCosts[nextLevel + 1] : null;

      return {
        newLevel: nextLevel,
        newPowerLevel: nextLevel,
        coinsPerTap: nextLevel,
        coinsRemaining: updatedCoins,
        newCoins: updatedCoins,
        nextCost,
        nextPowerCost: nextCost,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/clicker/upgrade-energy — Upgrade energy recharge speed (1 -> 5 levels)
apiRouter.post('/clicker/upgrade-energy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

    const result = await withTransaction(async (client) => {
      let cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
      if (cRes.rowCount === 0) {
        cRes = await client.query(
          `INSERT INTO user_clicker (user_id, power_level, recharge_level, current_energy, last_energy_updated_at, total_clicks)
           VALUES ($1, 1, 1, 100, CURRENT_TIMESTAMP, 0)
           RETURNING *`,
          [user.id]
        );
      }
      const clicker = cRes.rows[0];
      const currentRecharge = clicker.recharge_level || 1;

      if (currentRecharge >= MAX_LEVEL) {
        throw new Error('Достигнут максимальный уровень скорости восстановления (5)');
      }

      const nextLevel = currentRecharge + 1;
      const cost = CLICKER_CONFIG.rechargeUpgradeCosts[nextLevel];

      const uRes = await client.query('SELECT coins FROM users WHERE id = $1', [user.id]);
      const userCoins = uRes.rows[0].coins;

      if (userCoins < cost) {
        throw new Error(`Недостаточно Coins. Требуется ${cost} Coins`);
      }

      // Deduct coins & update recharge level
      await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [cost, user.id]);
      await client.query('UPDATE user_clicker SET recharge_level = $1 WHERE user_id = $2', [
        nextLevel,
        user.id,
      ]);

      const updatedCoins = userCoins - cost;
      const nextCost = nextLevel < MAX_LEVEL ? CLICKER_CONFIG.rechargeUpgradeCosts[nextLevel + 1] : null;
      const newSecondsPerUnit = CLICKER_CONFIG.rechargeSecondsPerUnit[nextLevel];

      return {
        newLevel: nextLevel,
        newRechargeLevel: nextLevel,
        secondsPerEnergy: newSecondsPerUnit,
        secondsPerUnit: newSecondsPerUnit,
        coinsRemaining: updatedCoins,
        newCoins: updatedCoins,
        nextCost,
        nextRechargeCost: nextCost,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/clicker/claim-daily-help — Claim 300 Coins daily help if balance < 500 Coins
apiRouter.post('/clicker/claim-daily-help', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

    const result = await withTransaction(async (client) => {
      const uRes = await client.query('SELECT coins FROM users WHERE id = $1', [user.id]);
      const currentCoins = uRes.rows[0].coins;

      if (currentCoins >= 500) {
        throw new Error('Помощь доступна только при балансе менее 500 Coins');
      }

      let cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
      if (cRes.rowCount === 0) {
        cRes = await client.query(
          `INSERT INTO user_clicker (user_id, power_level, recharge_level, current_energy, last_energy_updated_at, total_clicks)
           VALUES ($1, 1, 1, 100, CURRENT_TIMESTAMP, 0)
           RETURNING *`,
          [user.id]
        );
      }
      const clicker = cRes.rows[0];

      if (clicker.last_daily_help_at) {
        const elapsed = Date.now() - new Date(clicker.last_daily_help_at).getTime();
        if (elapsed < DAILY_HELP_COOLDOWN_MS) {
          const waitSec = Math.ceil((DAILY_HELP_COOLDOWN_MS - elapsed) / 1000);
          throw new Error(`Ежедневная помощь уже получена. Доступна через ${waitSec} сек.`);
        }
      }

      const nowIso = new Date().toISOString();
      await client.query('UPDATE user_clicker SET last_daily_help_at = $1 WHERE user_id = $2', [
        nowIso,
        user.id,
      ]);

      const updateRes = await client.query(
        'UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins',
        [DAILY_HELP_AMOUNT, user.id]
      );

      return {
        addedCoins: DAILY_HELP_AMOUNT,
        coinsAdded: DAILY_HELP_AMOUNT,
        totalCoins: updateRes.rows[0].coins,
        newCoins: updateRes.rows[0].coins,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/clicker/claim-task — Claim reward for completed clicker task
apiRouter.post('/clicker/claim-task', async (req: AuthenticatedRequest, res: Response) => {
  const { taskId } = req.body;
  if (!taskId) {
    return res.status(400).json({ success: false, error: 'Missing taskId' });
  }

  const taskDef = CLICKER_TASKS.find((t) => t.id === taskId);
  if (!taskDef) {
    return res.status(404).json({ success: false, error: 'Задание не найдено' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    const result = await withTransaction(async (client) => {
      let cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
      if (cRes.rowCount === 0) {
        throw new Error('Данные кликера не найдены');
      }
      const clicker = cRes.rows[0];
      const claimedList: string[] = Array.isArray(clicker.claimed_tasks)
        ? clicker.claimed_tasks
        : typeof clicker.claimed_tasks === 'string'
        ? JSON.parse(clicker.claimed_tasks)
        : [];

      if (claimedList.includes(taskId)) {
        throw new Error('Награда за это задание уже получена');
      }

      let isCompleted = false;
      if (taskDef.id === 'daily_enter') {
        isCompleted = true;
      } else if (taskDef.id === 'buy_upgrade') {
        isCompleted = clicker.power_level > 1 || clicker.recharge_level > 1;
      } else if (taskDef.type === 'clicks') {
        isCompleted = (clicker.total_clicks || 0) >= taskDef.targetCount;
      }

      if (!isCompleted) {
        throw new Error('Задание еще не выполнено');
      }

      // Add task to claimed list
      const updatedClaimed = [...claimedList, taskId];
      await client.query(
        'UPDATE user_clicker SET claimed_tasks = $1 WHERE user_id = $2',
        [JSON.stringify(updatedClaimed), user.id]
      );

      // Award coins
      const uRes = await client.query(
        'UPDATE users SET coins = coins + $1 WHERE id = $2 RETURNING coins',
        [taskDef.reward, user.id]
      );

      return {
        coins: uRes.rows[0].coins,
        rewardCoins: taskDef.reward,
        claimedTaskId: taskId,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Helper for Card Rarity Scoring (Leaderboard)
function getCardRarityWeight(material: string, category: string): number {
  let matScore = 100;
  if (material === 'Holographic') matScore = 5000;
  else if (material === 'Titanium') matScore = 3500;
  else if (material === 'Black Carbon') matScore = 2500;
  else if (material === 'Gold') matScore = 1800;
  else if (material === 'Matte Plastic') matScore = 300;

  let patScore = 50;
  const c = (category || '').toLowerCase();
  if (c.includes('mirror')) patScore = 2500;
  else if (c.includes('quad')) patScore = 1500;
  else if (c.includes('straight')) patScore = 900;
  else if (c.includes('repeater')) patScore = 600;
  else if (c.includes('triple')) patScore = 400;
  else if (c.includes('pair')) patScore = 200;

  return matScore + patScore;
}

// GET /api/leaderboard — Leaderboard rankings for Coins, Cards count, and Best Card
apiRouter.get('/leaderboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const category = (req.query.category as string) || 'coins'; // 'coins' | 'cards' | 'best_card'

    let allRanked: any[] = [];

    if (getIsMockMode()) {
      const mock = getMockDB();
      if (category === 'coins') {
        // Sort by coins DESC, id ASC (tie breaker: earliest registration)
        allRanked = [...mock.users]
          .sort((a, b) => (b.coins || 0) - (a.coins || 0) || a.id - b.id)
          .map((u) => ({
            userId: u.id,
            telegramId: u.telegram_id,
            username: u.username || 'VIP Игрок',
            firstName: u.first_name || u.username || 'Игрок',
            photoUrl: u.photo_url || null,
            score: u.coins || 0,
            formattedScore: `${(u.coins || 0).toLocaleString('ru-RU')} ₽`,
          }));
      } else if (category === 'cards') {
        // Count regular minted cards (not free/bomj). Tie breaker: total estimate value, then id
        allRanked = mock.users.map((u) => {
          const userCards = (mock.cards || []).filter(
            (c) => Number(c.user_id) === Number(u.id) && c.case_tier !== 'free' && !c.is_bomj
          );
          const totalEstimate = userCards.reduce((acc, c) => acc + (Number(c.estimated_value) || 0), 0);
          return {
            userId: u.id,
            telegramId: u.telegram_id,
            username: u.username || 'VIP Игрок',
            firstName: u.first_name || u.username || 'Игрок',
            photoUrl: u.photo_url || null,
            score: userCards.length,
            totalEstimate,
            formattedScore: `${userCards.length} шт.`,
          };
        }).sort((a, b) => b.score - a.score || b.totalEstimate - a.totalEstimate || a.userId - b.userId);
      } else if (category === 'best_card') {
        // Best card currently owned by player (!is_sold). Ranked by rarity score, then estimate, then card date
        const userBestMap: { [userId: number]: any } = {};
        for (const card of mock.cards || []) {
          if (card.is_sold) continue;
          const uId = Number(card.user_id);
          const cat = card.category || card.number_pattern || 'Standard';
          const rWeight = getCardRarityWeight(card.material, cat) + (Number(card.collector_score) || 0) * 10;
          const est = calculateRecommendedPrice(card).avgPrice || Math.max(100, (card.collector_score || 20) * 25);
          const existing = userBestMap[uId];
          if (!existing || rWeight > existing.rWeight || (rWeight === existing.rWeight && est > existing.est)) {
            userBestMap[uId] = { card, rWeight, est };
          }
        }

        allRanked = Object.keys(userBestMap)
          .map((uIdStr) => {
            const uId = Number(uIdStr);
            const u = mock.users.find((userItem) => Number(userItem.id) === uId);
            const { card, rWeight, est } = userBestMap[uId];
            const serialId = card.serial_number || card.serial_id || `CD-${String(card.id).padStart(6, '0')}`;
            return {
              userId: uId,
              telegramId: u?.telegram_id || 0,
              username: u?.username || 'VIP Игрок',
              firstName: u?.first_name || u?.username || 'Игрок',
              photoUrl: u?.photo_url || null,
              score: est,
              rWeight,
              formattedScore: `${est.toLocaleString('ru-RU')} ₽`,
              cardMeta: {
                id: card.id,
                serialId,
                bank: card.bank,
                material: card.material,
                numberPattern: card.category || card.number_pattern,
                category: card.category,
                cardNumber: card.card_number,
                estimatedValue: est,
              },
            };
          })
          .sort((a, b) => b.rWeight - a.rWeight || b.score - a.score || a.userId - b.userId);
      }
    } else {
      // PostgreSQL Queries
      if (category === 'coins') {
        const resCoins = await query(
          `SELECT id, telegram_id, username, first_name, photo_url, coins
           FROM users
           ORDER BY coins DESC, id ASC
           LIMIT 200`
        );
        allRanked = resCoins.rows.map((u) => ({
          userId: u.id,
          telegramId: u.telegram_id,
          username: u.username || 'VIP Игрок',
          firstName: u.first_name || u.username || 'Игрок',
          photoUrl: u.photo_url || null,
          score: u.coins || 0,
          formattedScore: `${(u.coins || 0).toLocaleString('ru-RU')} ₽`,
        }));
      } else if (category === 'cards') {
        const resCards = await query(
          `SELECT u.id, u.telegram_id, u.username, u.first_name, u.photo_url,
                  COUNT(c.id) AS card_count,
                  COALESCE(SUM(c.estimated_value), 0) AS total_estimate
           FROM users u
           LEFT JOIN cards c ON c.user_id = u.id AND (c.case_tier IS NULL OR c.case_tier != 'free')
           GROUP BY u.id
           ORDER BY COUNT(c.id) DESC, total_estimate DESC, u.id ASC
           LIMIT 200`
        );
        allRanked = resCards.rows.map((u) => ({
          userId: u.id,
          telegramId: u.telegram_id,
          username: u.username || 'VIP Игрок',
          firstName: u.first_name || u.username || 'Игрок',
          photoUrl: u.photo_url || null,
          score: Number(u.card_count) || 0,
          totalEstimate: Number(u.total_estimate) || 0,
          formattedScore: `${Number(u.card_count) || 0} шт.`,
        }));
      } else if (category === 'best_card') {
        const resBest = await query(
          `WITH user_best_cards AS (
             SELECT DISTINCT ON (c.user_id)
               c.user_id, c.id AS card_id, c.serial_number, c.bank, c.material,
               c.category, c.card_number, c.collector_score,
               (CASE WHEN c.material = 'Holographic' THEN 18000
                     WHEN c.material = 'Titanium' THEN 9000
                     WHEN c.material = 'Black Carbon' THEN 3600
                     WHEN c.material = 'Gold' THEN 1800
                     WHEN c.material = 'Matte Plastic' THEN 250
                     ELSE 100 END +
                CASE WHEN c.category = 'Mirror' THEN 12000
                     WHEN c.category = 'Quad' THEN 2500
                     WHEN c.category = 'Straight' THEN 1000
                     WHEN c.category = 'Repeater' THEN 500
                     WHEN c.category = 'Triple' THEN 300
                     WHEN c.category = 'Pair' THEN 150
                     ELSE 0 END +
                COALESCE(c.collector_score, 20) * 10) AS estimated_calc
             FROM cards c
             WHERE c.is_sold = false OR c.is_sold IS NULL
             ORDER BY c.user_id, estimated_calc DESC, c.id ASC
           )
           SELECT u.id, u.telegram_id, u.username, u.first_name, u.photo_url,
                  ub.card_id, ub.serial_number, ub.bank, ub.material, ub.category,
                  ub.card_number, ub.collector_score, ub.estimated_calc
           FROM user_best_cards ub
           JOIN users u ON u.id = ub.user_id
           ORDER BY ub.estimated_calc DESC, u.id ASC
           LIMIT 200`
        );
        allRanked = resBest.rows.map((row) => {
          const est = Number(row.estimated_calc) || 100;
          const serialId = row.serial_number || `CD-${String(row.card_id).padStart(6, '0')}`;
          return {
            userId: row.id,
            telegramId: row.telegram_id,
            username: row.username || 'VIP Игрок',
            firstName: row.first_name || row.username || 'Игрок',
            photoUrl: row.photo_url || null,
            score: est,
            formattedScore: `${est.toLocaleString('ru-RU')} ₽`,
            cardMeta: {
              id: row.card_id,
              serialId,
              bank: row.bank,
              material: row.material,
              category: row.category,
              numberPattern: row.category,
              cardNumber: row.card_number,
              estimatedValue: est,
            },
          };
        });
      }
    }

    // Attach Rank, History Trends (↑ 12, ↓ 3, —, Новый), and update History
    const historyRes = await query(
      'SELECT last_position FROM leaderboard_history WHERE user_id = $1 AND category = $2',
      [user.id, category]
    );
    const prevPosition = historyRes.rows.length > 0 ? Number(historyRes.rows[0].last_position) : null;

    let myIndex = allRanked.findIndex((item) => Number(item.userId) === Number(user.id));
    let myRank = myIndex !== -1 ? myIndex + 1 : allRanked.length + 1;

    let myTrend: 'up' | 'down' | 'same' | 'new' = 'new';
    let myChangeValue = 0;
    if (prevPosition !== null) {
      if (myRank < prevPosition) {
        myTrend = 'up';
        myChangeValue = prevPosition - myRank;
      } else if (myRank > prevPosition) {
        myTrend = 'down';
        myChangeValue = myRank - prevPosition;
      } else {
        myTrend = 'same';
      }
    }

    // Persist current position in history
    await query(
      `INSERT INTO leaderboard_history (user_id, category, last_position)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, category) DO UPDATE SET last_position = $3, updated_at = CURRENT_TIMESTAMP`,
      [user.id, category, myRank]
    );

    // Build Top 100 list
    const top100 = allRanked.slice(0, 100).map((item, idx) => ({
      ...item,
      rank: idx + 1,
      trend: item.userId === user.id ? myTrend : 'same',
      changeValue: item.userId === user.id ? myChangeValue : undefined,
    }));

    // Calculate My Position details
    const myItem = allRanked[myIndex];
    let diffToNext: number | null = null;
    let nextScore: number | null = null;
    let nextCardMeta: any = null;

    if (myIndex > 0) {
      const playerAbove = allRanked[myIndex - 1];
      nextScore = playerAbove.score;
      diffToNext = Math.max(1, (playerAbove.score || 0) - ((myItem?.score) || 0) + (category === 'cards' ? 1 : 0));
      if (category === 'best_card') {
        nextCardMeta = playerAbove.cardMeta;
      }
    } else if (myIndex === 0) {
      diffToNext = 0; // Already 1st place!
    } else if (allRanked.length > 0) {
      // User not in ranked list (e.g. 0 cards or no unsold card)
      const lastPlayer = allRanked[allRanked.length - 1];
      diffToNext = Math.max(1, (lastPlayer.score || 0) + 1);
    }

    const myPosition = {
      rank: myRank,
      score: myItem ? myItem.score : 0,
      formattedScore: myItem ? myItem.formattedScore : (category === 'cards' ? '0 шт.' : '0 ₽'),
      trend: myTrend,
      changeValue: myChangeValue,
      diffToNext,
      nextScore,
      nextCardMeta,
      cardMeta: myItem?.cardMeta || null,
    };

    res.json({
      success: true,
      category,
      top: top100,
      myPosition,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/settings — Retrieve player settings
apiRouter.get('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const sRes = await query('SELECT * FROM user_settings WHERE user_id = $1', [user.id]);
    const s = sRes.rows[0] || {
      sound_enabled: true,
      haptics_enabled: true,
      animations_enabled: true,
      notifications_enabled: true,
      compact_mode: false,
      onboarding_completed: false,
    };

    res.json({
      success: true,
      settings: {
        soundEnabled: s.sound_enabled ?? true,
        hapticsEnabled: s.haptics_enabled ?? true,
        animationsEnabled: s.animations_enabled ?? true,
        notificationsEnabled: s.notifications_enabled ?? true,
        compactMode: s.compact_mode ?? false,
        onboardingCompleted: s.onboarding_completed ?? false,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/settings — Update player settings
apiRouter.post('/settings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const {
      soundEnabled = true,
      hapticsEnabled = true,
      animationsEnabled = true,
      notificationsEnabled = true,
      compactMode = false,
      onboardingCompleted = false,
    } = req.body;

    const sRes = await query(
      `INSERT INTO user_settings (user_id, sound_enabled, haptics_enabled, animations_enabled, notifications_enabled, compact_mode, onboarding_completed, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id) DO UPDATE SET
         sound_enabled = EXCLUDED.sound_enabled,
         haptics_enabled = EXCLUDED.haptics_enabled,
         animations_enabled = EXCLUDED.animations_enabled,
         notifications_enabled = EXCLUDED.notifications_enabled,
         compact_mode = EXCLUDED.compact_mode,
         onboarding_completed = EXCLUDED.onboarding_completed,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        user.id,
        Boolean(soundEnabled),
        Boolean(hapticsEnabled),
        Boolean(animationsEnabled),
        Boolean(notificationsEnabled),
        Boolean(compactMode),
        Boolean(onboardingCompleted),
      ]
    );

    const s = sRes.rows[0];
    res.json({
      success: true,
      settings: {
        soundEnabled: s.sound_enabled,
        hapticsEnabled: s.haptics_enabled,
        animationsEnabled: s.animations_enabled,
        notificationsEnabled: s.notifications_enabled,
        compactMode: s.compact_mode,
        onboardingCompleted: s.onboarding_completed,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/verify — Check if password matches or user has admin role
apiRouter.post('/admin/verify', async (req: AuthenticatedRequest, res: Response) => {
  const { password } = req.body;
  const isMatch = password === ADMIN_SECRET_PASSWORD || isUserAdmin(req.telegramUser);
  res.json({ success: true, isAdmin: Boolean(isMatch) });
});

// GET /api/admin/users — Search and inspect players
apiRouter.get('/admin/users', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const search = (req.query.query as string || '').trim().toLowerCase();
    let usersList: any[] = [];

    if (getIsMockMode()) {
      const mock = getMockDB();
      usersList = mock.users
        .filter((u) => {
          if (!search) return true;
          return (
            String(u.id) === search ||
            String(u.telegram_id) === search ||
            (u.username && u.username.toLowerCase().includes(search)) ||
            (u.first_name && u.first_name.toLowerCase().includes(search))
          );
        })
        .map((u) => {
          const cardsCount = (mock.cards || []).filter((c) => Number(c.user_id) === Number(u.id)).length;
          const clicker = (mock.user_clicker || []).find((c) => Number(c.user_id) === Number(u.id));
          return {
            id: u.id,
            telegramId: u.telegram_id,
            username: u.username,
            firstName: u.first_name,
            coins: u.coins,
            level: u.level,
            prefix: u.prefix || null,
            cardsCount,
            totalClicks: clicker?.total_clicks || 0,
            createdAt: u.created_at,
          };
        });
    } else {
      const usersRes = await query(
        `SELECT u.id, u.telegram_id, u.username, u.first_name, u.coins, u.level, u.prefix, u.created_at,
                COUNT(c.id) AS cards_count,
                COALESCE(cl.total_clicks, 0) AS total_clicks
         FROM users u
         LEFT JOIN cards c ON c.user_id = u.id
         LEFT JOIN user_clicker cl ON cl.user_id = u.id
         WHERE $1 = '' OR u.username ILIKE '%' || $1 || '%' OR u.first_name ILIKE '%' || $1 || '%' OR u.id::text = $1 OR u.telegram_id::text = $1
         GROUP BY u.id, cl.total_clicks
         ORDER BY u.id DESC
         LIMIT 50`,
        [search]
      );
      usersList = usersRes.rows.map((row) => ({
        id: row.id,
        telegramId: row.telegram_id,
        username: row.username,
        firstName: row.first_name,
        coins: row.coins,
        level: row.level,
        prefix: row.prefix || null,
        cardsCount: Number(row.cards_count),
        totalClicks: Number(row.total_clicks),
        createdAt: row.created_at,
      }));
    }

    res.json({ success: true, users: usersList });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/adjust-balance — Adjust user balance with audit log
apiRouter.post('/admin/adjust-balance', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUserId, amount, reason } = req.body;
    if (!targetUserId || typeof amount !== 'number' || !reason || reason.trim().length < 3) {
      return res.status(400).json({
        success: false,
        error: 'Требуется указать ID игрока, число монет и причину изменения (минимум 3 символа)',
      });
    }

    const adminTgId = req.telegramUser?.id || 0;

    const result = await withTransaction(async (client) => {
      const userRes = await client.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
      if (userRes.rowCount === 0) {
        throw new Error('Игрок с указанным ID не найден');
      }

      const prevCoins = userRes.rows[0].coins;
      const newCoins = Math.max(0, prevCoins + amount);

      const updateRes = await client.query('UPDATE users SET coins = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING coins', [
        newCoins,
        targetUserId,
      ]);

      // Record in Coin Ledger
      await client.query(
        `INSERT INTO coin_ledger (user_id, amount, balance_after, reason, reference_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [targetUserId, amount, newCoins, `[ADMIN] ${reason.trim()}`, `admin_${adminTgId}`]
      );

      // Record in Admin Audit Log
      await client.query(
        `INSERT INTO admin_audit_log (admin_telegram_id, action, target_user_id, reason, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          adminTgId,
          'adjust_balance',
          targetUserId,
          reason.trim(),
          JSON.stringify({ prevCoins, amount, newCoins }),
        ]
      );

      return { prevCoins, newCoins: updateRes.rows[0].coins };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/admin/set-prefix — Set or clear user badge prefix with audit log
apiRouter.post('/admin/set-prefix', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { targetUserId, prefix, reason = 'Назначение префикса' } = req.body;
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: 'Требуется указать ID игрока',
      });
    }

    const cleanPrefix = prefix ? String(prefix).trim().slice(0, 32) : null;
    const adminTgId = req.telegramUser?.id || 0;

    const result = await withTransaction(async (client) => {
      const userRes = await client.query('SELECT * FROM users WHERE id = $1', [targetUserId]);
      if (userRes.rowCount === 0) {
        throw new Error('Игрок с указанным ID не найден');
      }

      const prevPrefix = userRes.rows[0].prefix || null;

      await client.query(
        'UPDATE users SET prefix = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [cleanPrefix, targetUserId]
      );

      // Record in Admin Audit Log
      await client.query(
        `INSERT INTO admin_audit_log (admin_telegram_id, action, target_user_id, reason, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          adminTgId,
          'set_prefix',
          targetUserId,
          reason,
          JSON.stringify({ prevPrefix, newPrefix: cleanPrefix }),
        ]
      );

      return {
        targetUserId,
        prevPrefix,
        prefix: cleanPrefix,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/admin/audit-logs — Retrieve recent audit logs
apiRouter.get('/admin/audit-logs', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logsRes = await query('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT 50');
    res.json({ success: true, logs: logsRes.rows });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/stats — Retrieve overview system stats
apiRouter.get('/admin/stats', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (getIsMockMode()) {
      const mock = getMockDB();
      const totalUsers = mock.users.length;
      const totalCards = (mock.cards || []).length;
      const totalCoins = mock.users.reduce((acc, u) => acc + (u.coins || 0), 0);
      const totalClicks = (mock.user_clicker || []).reduce((acc, c) => acc + (c.total_clicks || 0), 0);
      return res.json({
        success: true,
        stats: { totalUsers, totalCards, totalCoins, totalClicks },
      });
    }

    const [uRes, cRes, coinsRes, clickRes] = await Promise.all([
      query('SELECT COUNT(*) AS count FROM users'),
      query('SELECT COUNT(*) AS count FROM cards'),
      query('SELECT COALESCE(SUM(coins), 0) AS sum FROM users'),
      query('SELECT COALESCE(SUM(total_clicks), 0) AS sum FROM user_clicker'),
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers: Number(uRes.rows[0].count),
        totalCards: Number(cRes.rows[0].count),
        totalCoins: Number(coinsRes.rows[0].sum),
        totalClicks: Number(clickRes.rows[0].sum),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 🛒 P2P MARKETPLACE ROUTES
// ==========================================

// GET /api/market/listings — Browse active listings with filters
apiRouter.get('/market/listings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(parseInt((req.query.page as string) || '1', 10), 1);
    const limit = Math.min(parseInt((req.query.limit as string) || '40', 10), 100);
    const search = ((req.query.search as string) || '').trim().toLowerCase();
    const bank = req.query.bank as string | undefined;
    const material = req.query.material as string | undefined;
    const category = req.query.category as string | undefined;
    const minPrice = parseInt((req.query.minPrice as string) || '0', 10);
    const maxPrice = parseInt((req.query.maxPrice as string) || '0', 10);
    const sortBy = (req.query.sortBy as string) || 'newest';

    const listingsRes = await query(`
      SELECT ml.*, 
             c.card_number, c.bank, c.material, c.category, c.collector_score, c.serial_number, c.collection_code,
             u.username as seller_username, u.photo_url as seller_photo, u.prefix as seller_prefix
      FROM market_listings ml
      JOIN cards c ON ml.card_id = c.id
      JOIN users u ON ml.seller_id = u.id
      WHERE ml.status = 'active' AND ml.expires_at > CURRENT_TIMESTAMP
      ORDER BY ml.created_at DESC
    `);

    let items = listingsRes.rows;

    // Apply in-memory filtering (consistent across mock and postgres)
    if (search) {
      items = items.filter(
        (i: any) =>
          (i.card_number && i.card_number.toLowerCase().includes(search)) ||
          (i.serial_number && i.serial_number.toLowerCase().includes(search)) ||
          (i.seller_username && i.seller_username.toLowerCase().includes(search))
      );
    }
    if (bank) {
      items = items.filter((i: any) => i.bank === bank);
    }
    if (material) {
      items = items.filter((i: any) => i.material === material);
    }
    if (category) {
      items = items.filter((i: any) => i.category === category);
    }
    if (minPrice > 0) {
      items = items.filter((i: any) => i.price >= minPrice);
    }
    if (maxPrice > 0) {
      items = items.filter((i: any) => i.price <= maxPrice);
    }

    // Sort
    if (sortBy === 'price_asc') {
      items.sort((a: any, b: any) => a.price - b.price);
    } else if (sortBy === 'price_desc') {
      items.sort((a: any, b: any) => b.price - a.price);
    } else if (sortBy === 'score_desc') {
      items.sort((a: any, b: any) => (b.collector_score || 0) - (a.collector_score || 0));
    } else {
      // newest
      items.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    const total = items.length;
    const startIndex = (page - 1) * limit;
    const paginated = items.slice(startIndex, startIndex + limit);

    res.json({
      success: true,
      listings: paginated,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/my-listings — Current user's market listings
apiRouter.get('/market/my-listings', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const listingsRes = await query(
      `SELECT ml.*, 
              c.card_number, c.bank, c.material, c.category, c.collector_score, c.serial_number, c.collection_code
       FROM market_listings ml
       JOIN cards c ON ml.card_id = c.id
       WHERE ml.seller_id = $1
       ORDER BY ml.created_at DESC`,
      [user.id]
    );

    res.json({
      success: true,
      listings: listingsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/history — Global recent successful deals
apiRouter.get('/market/history', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dealsRes = await query(`
      SELECT mdh.*, 
             c.bank as card_bank, c.material as card_material, c.category as card_category, c.serial_number as card_serial,
             s.username as seller_username, s.prefix as seller_prefix,
             b.username as buyer_username, b.prefix as buyer_prefix
      FROM market_deals_history mdh
      LEFT JOIN cards c ON mdh.card_id = c.id
      LEFT JOIN users s ON mdh.seller_id = s.id
      LEFT JOIN users b ON mdh.buyer_id = b.id
      ORDER BY mdh.created_at DESC
      LIMIT 50
    `);

    res.json({
      success: true,
      deals: dealsRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/estimate/:cardId — Price recommendation and fee preview for user's card
apiRouter.get('/market/estimate/:cardId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);
    const cardId = parseInt(req.params.cardId, 10);
    if (isNaN(cardId)) {
      return res.status(400).json({ success: false, error: 'Некорректный ID карты' });
    }

    const cardRes = await query('SELECT * FROM cards WHERE id = $1 AND user_id = $2', [cardId, user.id]);
    if (cardRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Карта не найдена в вашей коллекции' });
    }

    const card = cardRes.rows[0];
    const eligibility = isCardEligibleForListing(card);

    // Fetch recent deals of similar card
    const dealsRes = await query('SELECT * FROM market_deals_history ORDER BY created_at DESC LIMIT 100');
    const estimate = calculateRecommendedPrice(card, dealsRes.rows);

    res.json({
      success: true,
      card,
      estimate,
      feePercent: MARKET_FEE_PERCENT,
      listingDurationDays: LISTING_DURATION_DAYS,
      eligibility,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/market/seller/:userId — Public profile of seller
apiRouter.get('/market/seller/:userId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    const userRes = await query('SELECT id, username, first_name, photo_url, prefix, level, created_at FROM users WHERE id = $1', [targetId]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Продавец не найден' });
    }

    const seller = userRes.rows[0];
    const listingsRes = await query("SELECT COUNT(*) as count FROM market_listings WHERE seller_id = $1 AND status = 'active'", [targetId]);
    const dealsRes = await query('SELECT COUNT(*) as count FROM market_deals_history WHERE seller_id = $1', [targetId]);

    res.json({
      success: true,
      seller: {
        id: seller.id,
        username: seller.username,
        firstName: seller.first_name,
        photoUrl: seller.photo_url,
        prefix: seller.prefix,
        level: seller.level,
        activeListingsCount: Number(listingsRes.rows[0]?.count || 0),
        completedSalesCount: Number(dealsRes.rows[0]?.count || 0),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/market/list — List card for sale on P2P marketplace
apiRouter.post('/market/list', async (req: AuthenticatedRequest, res: Response) => {
  const { cardId, price } = req.body;
  const numCardId = parseInt(cardId, 10);
  const numPrice = parseInt(price, 10);

  if (isNaN(numCardId)) {
    return res.status(400).json({ success: false, error: 'Укажите карту для продажи' });
  }
  if (isNaN(numPrice) || numPrice < 50 || numPrice > 100000000) {
    return res.status(400).json({ success: false, error: 'Цена должна быть от 50 до 100 000 000 ₽' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    const cardRes = await query('SELECT * FROM cards WHERE id = $1 AND user_id = $2', [numCardId, user.id]);
    if (cardRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Карта не найдена в вашей коллекции' });
    }

    const card = cardRes.rows[0];
    const eligibility = isCardEligibleForListing(card);
    if (!eligibility.eligible) {
      return res.status(400).json({ success: false, error: eligibility.reason });
    }

    // Check if card is currently in active negotiation with Avita
    const avitaRes = await query("SELECT * FROM avita_sessions WHERE user_id = $1 AND status = 'active'", [user.id]);
    if (avitaRes.rowCount > 0) {
      const activeSession = avitaRes.rows[0];
      const sessionCardIds = Array.isArray(activeSession.card_ids) ? activeSession.card_ids : [];
      if (sessionCardIds.includes(numCardId)) {
        return res.status(400).json({
          success: false,
          error: 'Карта сейчас участвует в торгах со скупщиком Авита. Завершите или отмените сделку с Авита.',
        });
      }
    }

    const expiresAt = calculateListingExpiry(LISTING_DURATION_DAYS).toISOString();

    const result = await withTransaction(async (client) => {
      // 1. Mark card as listed on market
      await client.query('UPDATE cards SET is_listed_on_market = true WHERE id = $1', [numCardId]);

      // 2. Insert into market_listings
      const listingRes = await client.query(
        `INSERT INTO market_listings (seller_id, card_id, price, fee_percent, status, expires_at)
         VALUES ($1, $2, $3, $4, 'active', $5)
         RETURNING *`,
        [user.id, numCardId, numPrice, MARKET_FEE_PERCENT, expiresAt]
      );

      return listingRes.rows[0];
    });

    res.json({
      success: true,
      listing: result,
      feeInfo: calculateMarketFee(numPrice),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/market/buy — Buy listed card atomically
apiRouter.post('/market/buy', async (req: AuthenticatedRequest, res: Response) => {
  const { listingId } = req.body;
  const numListingId = parseInt(listingId, 10);
  if (isNaN(numListingId)) {
    return res.status(400).json({ success: false, error: 'Укажите ID объявления' });
  }

  try {
    const buyer = await getOrCreateUser(req.telegramUser);

    const listingRes = await query('SELECT * FROM market_listings WHERE id = $1', [numListingId]);
    if (listingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Объявление не найдено' });
    }

    const listing = listingRes.rows[0];
    if (listing.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Этот лот уже продан или снят с продажи' });
    }
    if (new Date(listing.expires_at).getTime() <= Date.now()) {
      return res.status(400).json({ success: false, error: 'Срок размещения этого лота истёк' });
    }
    if (listing.seller_id === buyer.id) {
      return res.status(400).json({ success: false, error: 'Вы не можете купить собственную карту' });
    }
    if (buyer.coins < listing.price) {
      return res.status(400).json({
        success: false,
        error: `Недостаточно средств. Цена: ${listing.price.toLocaleString('ru-RU')} ₽, у вас: ${buyer.coins.toLocaleString('ru-RU')} ₽`,
      });
    }

    const { feeCoins, netPayout } = calculateMarketFee(listing.price);

    const transactionResult = await withTransaction(async (client) => {
      // 1. Deduct coins from buyer
      await client.query('UPDATE users SET coins = coins - $1 WHERE id = $2', [listing.price, buyer.id]);

      // 2. Credit netPayout to seller
      await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [netPayout, listing.seller_id]);

      // 3. Transfer card ownership to buyer and unmark is_listed_on_market
      await client.query('UPDATE cards SET user_id = $1, is_listed_on_market = false WHERE id = $2', [
        buyer.id,
        listing.card_id,
      ]);

      // 4. Mark listing as sold
      const nowIso = new Date().toISOString();
      await client.query(
        "UPDATE market_listings SET status = 'sold', buyer_id = $1, sold_at = $2 WHERE id = $3",
        [buyer.id, nowIso, listing.id]
      );

      // 5. Insert record into market_deals_history
      await client.query(
        `INSERT INTO market_deals_history (listing_id, card_id, seller_id, buyer_id, price, fee_coins, net_payout)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [listing.id, listing.card_id, listing.seller_id, buyer.id, listing.price, feeCoins, netPayout]
      );

      // Fetch buyer updated balance
      const updatedBuyer = await client.query('SELECT coins FROM users WHERE id = $1', [buyer.id]);
      return {
        coinsRemaining: updatedBuyer.rows[0]?.coins ?? (buyer.coins - listing.price),
      };
    });

    res.json({
      success: true,
      listingId: listing.id,
      cardId: listing.card_id,
      price: listing.price,
      feeCoins,
      netPayout,
      coinsRemaining: transactionResult.coinsRemaining,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/market/cancel — Cancel active listing
apiRouter.post('/market/cancel', async (req: AuthenticatedRequest, res: Response) => {
  const { listingId } = req.body;
  const numListingId = parseInt(listingId, 10);
  if (isNaN(numListingId)) {
    return res.status(400).json({ success: false, error: 'Укажите ID объявления' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    const listingRes = await query('SELECT * FROM market_listings WHERE id = $1 AND seller_id = $2', [
      numListingId,
      user.id,
    ]);
    if (listingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Объявление не найдено или принадлежит другому игроку' });
    }

    const listing = listingRes.rows[0];
    if (listing.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Это объявление уже не активно' });
    }

    await withTransaction(async (client) => {
      await client.query("UPDATE market_listings SET status = 'cancelled' WHERE id = $1", [listing.id]);
      await client.query('UPDATE cards SET is_listed_on_market = false WHERE id = $1', [listing.card_id]);
    });

    res.json({
      success: true,
      message: 'Объявление успешно снято с продажи. Карта возвращена в коллекцию.',
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/market/update-price — Change price of active listing
apiRouter.post('/market/update-price', async (req: AuthenticatedRequest, res: Response) => {
  const { listingId, newPrice } = req.body;
  const numListingId = parseInt(listingId, 10);
  const priceNum = parseInt(newPrice, 10);

  if (isNaN(numListingId) || isNaN(priceNum) || priceNum < 50 || priceNum > 100000000) {
    return res.status(400).json({ success: false, error: 'Укажите корректную цену (от 50 до 100 000 000 ₽)' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const listingRes = await query('SELECT * FROM market_listings WHERE id = $1 AND seller_id = $2', [
      numListingId,
      user.id,
    ]);
    if (listingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Объявление не найдено' });
    }

    const listing = listingRes.rows[0];
    if (listing.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Можно изменить цену только у активного объявления' });
    }

    await query('UPDATE market_listings SET price = $1 WHERE id = $2', [priceNum, listing.id]);

    res.json({
      success: true,
      listingId: listing.id,
      newPrice: priceNum,
      feeInfo: calculateMarketFee(priceNum),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/market/extend — Extend active listing duration by 7 days
apiRouter.post('/market/extend', async (req: AuthenticatedRequest, res: Response) => {
  const { listingId } = req.body;
  const numListingId = parseInt(listingId, 10);
  if (isNaN(numListingId)) {
    return res.status(400).json({ success: false, error: 'Укажите ID объявления' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);
    const listingRes = await query('SELECT * FROM market_listings WHERE id = $1 AND seller_id = $2', [
      numListingId,
      user.id,
    ]);
    if (listingRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Объявление не найдено' });
    }

    const listing = listingRes.rows[0];
    if (listing.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Продлить можно только активное объявление' });
    }

    const newExpiry = calculateListingExpiry(LISTING_DURATION_DAYS).toISOString();
    await query('UPDATE market_listings SET expires_at = $1 WHERE id = $2', [newExpiry, listing.id]);

    res.json({
      success: true,
      listingId: listing.id,
      expiresAt: newExpiry,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 🎁 PROMO CODES ROUTES
// ==========================================

// POST /api/promo/redeem — Redeem a promo code
apiRouter.post('/promo/redeem', async (req: AuthenticatedRequest, res: Response) => {
  const { code } = req.body;
  const rawCode = String(code || '').trim().toUpperCase();

  if (!rawCode || rawCode.length < 2) {
    return res.status(400).json({ success: false, error: 'Введите промокод' });
  }

  try {
    const user = await getOrCreateUser(req.telegramUser);

    // 1. Find promo code
    const promoRes = await query('SELECT * FROM promo_codes WHERE UPPER(code) = $1 AND is_active = true', [rawCode]);
    if (promoRes.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Промокод не найден или неактивен' });
    }

    const promo = promoRes.rows[0];

    // 2. Check expiration
    if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: 'Срок действия промокода истёк' });
    }

    // 3. Check max uses
    if (promo.max_uses > 0 && promo.uses_count >= promo.max_uses) {
      return res.status(400).json({ success: false, error: 'Лимит активаций этого промокода исчерпан' });
    }

    // 4. Check if user already activated
    const actRes = await query(
      'SELECT * FROM user_promo_activations WHERE user_id = $1 AND promo_id = $2',
      [user.id, promo.id]
    );
    if (actRes.rowCount > 0) {
      return res.status(400).json({ success: false, error: 'Вы уже активировали этот промокод' });
    }

    // 5. Grant reward
    let rewardMessage = '';
    let updatedCoins = user.coins;

    await withTransaction(async (client) => {
      if (promo.reward_type === 'coins') {
        const amount = Math.max(1, parseInt(promo.reward_value, 10) || 1000);
        await client.query('UPDATE users SET coins = coins + $1 WHERE id = $2', [amount, user.id]);
        updatedCoins = user.coins + amount;
        rewardMessage = `Вам начислено +${amount.toLocaleString('ru-RU')} ₽!`;
      } else if (promo.reward_type === 'cosmetic') {
        // Unlock cosmetic item
        const itemRes = await client.query('SELECT * FROM cosmetic_items WHERE item_key = $1', [promo.reward_value]);
        if (itemRes.rowCount > 0) {
          const item = itemRes.rows[0];
          await client.query(
            'INSERT INTO user_cosmetics (user_id, item_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [user.id, item.id]
          );
          rewardMessage = `Вам разблокирован предмет оформления: ${item.name}!`;
        } else {
          // Fallback reward in coins
          await client.query('UPDATE users SET coins = coins + 2000 WHERE id = $1', [user.id]);
          updatedCoins = user.coins + 2000;
          rewardMessage = 'Вам начислено +2 000 ₽!';
        }
      } else if (promo.reward_type === 'card') {
        // Generate and grant exclusive card
        const cardTier = promo.reward_value === 'gold' ? 'Gold' : 'Titanium';
        const newCard = generateCard('ВБ Банк', cardTier as MaterialName, 'Triple');
        await client.query(
          `INSERT INTO cards (card_uid, user_id, bank, material, category, card_number, collection_code, expires_at, collector_score, is_free_roll, serial_number)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, $10)`,
          [
            newCard.cardUid,
            user.id,
            newCard.bank,
            newCard.material,
            newCard.category,
            newCard.cardNumber,
            newCard.collectionCode,
            newCard.expiresAt,
            newCard.collectorScore,
            newCard.serialNumber,
          ]
        );
        rewardMessage = `Вам подарена эксклюзивная карта: ${newCard.bank} (${newCard.material})!`;
      }

      // 6. Record activation
      await client.query(
        `INSERT INTO user_promo_activations (user_id, promo_id, code, reward_type, reward_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, promo.id, promo.code, promo.reward_type, promo.reward_value]
      );

      // 7. Increment promo uses
      await client.query('UPDATE promo_codes SET uses_count = uses_count + 1 WHERE id = $1', [promo.id]);
    });

    res.json({
      success: true,
      rewardType: promo.reward_type,
      rewardValue: promo.reward_value,
      message: rewardMessage,
      coins: updatedCoins,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/promos — List all promo codes (Admin)
apiRouter.get('/admin/promos', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const promosRes = await query('SELECT * FROM promo_codes ORDER BY created_at DESC');
    res.json({
      success: true,
      promos: promosRes.rows,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/promos — Create a new promo code (Admin)
apiRouter.post('/admin/promos', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { code, rewardType, rewardValue, maxUses, expiresAt } = req.body;
  const rawCode = String(code || '').trim().toUpperCase();

  if (!rawCode || rawCode.length < 2) {
    return res.status(400).json({ success: false, error: 'Укажите валидный промокод' });
  }
  if (!['coins', 'cosmetic', 'card'].includes(rewardType)) {
    return res.status(400).json({ success: false, error: 'Тип награды должен быть: coins, cosmetic или card' });
  }
  if (!rewardValue) {
    return res.status(400).json({ success: false, error: 'Укажите значение награды' });
  }

  try {
    const promoRes = await query(
      `INSERT INTO promo_codes (code, reward_type, reward_value, max_uses, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [rawCode, rewardType, String(rewardValue), Number(maxUses || 0), expiresAt || null]
    );

    res.json({
      success: true,
      promo: promoRes.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/promos/:id — Delete or deactivate promo code (Admin)
apiRouter.delete('/admin/promos/:id', adminMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const promoId = parseInt(req.params.id, 10);
  if (isNaN(promoId)) {
    return res.status(400).json({ success: false, error: 'Некорректный ID промокода' });
  }

  try {
    await query('DELETE FROM promo_codes WHERE id = $1', [promoId]);
    res.json({ success: true, message: 'Промокод успешно удален' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});



