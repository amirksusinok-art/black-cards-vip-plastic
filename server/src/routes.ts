import { Router, Response } from 'express';
import crypto from 'crypto';
import { AuthenticatedRequest } from './auth.js';
import { query, withTransaction } from './db.js';
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
       VALUES ($1, $2, $3, $4, $5, 1500, 1, 0)
       RETURNING *`,
      [
        telegramUser.id,
        telegramUser.username || `user_${telegramUser.id}`,
        telegramUser.first_name || 'VIP Player',
        telegramUser.last_name || '',
        telegramUser.photo_url || '',
      ]
    );
  }
  return userRes.rows[0];
}

// GET /api/me — Profile & Balance
apiRouter.get('/me', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await getOrCreateUser(req.telegramUser);

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
        totalCards,
        favorites,
        freeRollsToday: freeRollData.daily_count,
        maxFreeRolls: 150,
        freeRollCooldownSeconds,
        tasksProgress: `${userTasksRes.rows.filter((t: any) => t.is_claimed).length} из 3 заданий`,
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
        const generated = generateCard(false, isBeginner, selectedTier);
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
  const limit = Math.min(parseInt((req.query.limit as string) || '40', 10), 100);
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

    const allTasksRes = await query('SELECT * FROM daily_tasks ORDER BY id ASC');
    const userTasksRes = await query(
      'SELECT * FROM user_tasks WHERE user_id = $1 AND task_date = $2',
      [user.id, today]
    );

    const userTaskMap = new Map(userTasksRes.rows.map((ut: any) => [ut.task_id, ut]));

    const tasks = allTasksRes.rows.map((task: any) => {
      const ut = userTaskMap.get(task.id);
      return {
        id: task.id,
        taskKey: task.task_key,
        title: task.title,
        rewardCoins: task.reward_coins,
        targetCount: task.target_count,
        currentProgress: ut ? ut.current_progress : 0,
        isClaimed: ut ? ut.is_claimed : false,
        canClaim: ut ? ut.current_progress >= task.target_count && !ut.is_claimed : false,
      };
    });

    res.json({ success: true, tasks });
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

// GET /api/leaderboard — Friends & Global VIP Collectors
apiRouter.get('/leaderboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const topUsers = await query(
      `SELECT u.id, u.username, u.first_name, u.photo_url, u.level,
              COUNT(c.id) as total_cards,
              COALESCE(SUM(c.collector_score), 0) as total_score
       FROM users u
       LEFT JOIN cards c ON c.user_id = u.id AND (c.is_sold IS NULL OR c.is_sold = false)
       GROUP BY u.id
       ORDER BY total_score DESC, total_cards DESC
       LIMIT 20`
    );

    res.json({
      success: true,
      leaderboard: topUsers.rows.map((r: any, idx: number) => ({
        rank: idx + 1,
        id: r.id,
        name: r.first_name || r.username || 'Аноним',
        username: r.username,
        photoUrl: r.photo_url,
        level: r.level,
        cardsCount: parseInt(r.total_cards, 10),
        score: parseInt(r.total_score, 10),
      })),
    });
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

    const clickerRes = await query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
    const clicker = clickerRes.rows[0];

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

    res.json({
      success: true,
      coins: user.coins,
      powerLevel,
      coinsPerClick: powerLevel,
      rechargeLevel,
      secondsPerUnit,
      currentEnergy: energyCalc.currentEnergy,
      maxEnergy: MAX_ENERGY,
      secondsUntilNextEnergy: energyCalc.secondsUntilNextEnergy,
      nextPowerCost,
      nextRechargeCost,
      canClaimDailyHelp,
      dailyHelpSecondsRemaining,
      dailyHelpAmount: DAILY_HELP_AMOUNT,
      totalClicks: clicker.total_clicks || 0,
      tasks: CLICKER_TASKS.map((t) => ({
        ...t,
        completed: (clicker.total_clicks || 0) >= t.targetCount,
      })),
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
      const cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
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
          currentEnergy: energyCalc.currentEnergy,
          userCoins: user.coins,
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

      return {
        tapsProcessed: tapResult.allowedTaps,
        coinsEarned: tapResult.coinsEarned,
        currentEnergy: tapResult.remainingEnergy,
        userCoins: newCoins,
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
      const cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
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
        newPowerLevel: nextLevel,
        newCoins: updatedCoins,
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
      const cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
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
        newRechargeLevel: nextLevel,
        newCoins: updatedCoins,
        nextRechargeCost: nextCost,
        secondsPerUnit: newSecondsPerUnit,
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

      const cRes = await client.query('SELECT * FROM user_clicker WHERE user_id = $1', [user.id]);
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
        coinsAdded: DAILY_HELP_AMOUNT,
        newCoins: updateRes.rows[0].coins,
      };
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

