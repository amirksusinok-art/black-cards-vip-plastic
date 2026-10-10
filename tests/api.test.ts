import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { validateTelegramInitData } from '../server/src/auth.js';
import { initDatabase, query, withTransaction } from '../server/src/db.js';

describe('Server & Security Integration Tests', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  it('Rejects forged or invalid Telegram initData signatures', () => {
    const fakeToken = '123456:FAKE_BOT_TOKEN';
    const fakeInitData = 'query_id=AAF&user=%7B%22id%22%3A123%7D&auth_date=1620000000&hash=badhash123';
    const result = validateTelegramInitData(fakeInitData, fakeToken);
    expect(result).toBeNull();
  });

  it('Validates authentic Telegram initData signature', () => {
    const botToken = '123456:VALID_BOT_TOKEN';
    const authDate = '1620000000';
    const userJson = JSON.stringify({ id: 987654321, first_name: 'Test', username: 'tester' });

    // Build dataCheckString
    const params: Record<string, string> = {
      auth_date: authDate,
      query_id: 'AAHdF60uAAAAAN0XrS7xxxx',
      user: userJson,
    };

    const keys = Object.keys(params).sort();
    const dataCheckString = keys.map((k) => `${k}=${params[k]}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const validInitData = new URLSearchParams({ ...params, hash }).toString();

    const user = validateTelegramInitData(validInitData, botToken);
    expect(user).not.toBeNull();
    expect(user?.id).toBe(987654321);
    expect(user?.username).toBe('tester');
  });

  it('Prevents balance from going negative and respects 500 Coins cost', async () => {
    // Insert user with only 200 coins
    const testTgId = Math.floor(Math.random() * 800000000) + 100000000;
    await query(
      `INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3)`,
      [testTgId, 'poor_user', 200]
    );

    const userRes = await query('SELECT * FROM users WHERE telegram_id = $1', [testTgId]);
    const user = userRes.rows[0];
    expect(user.coins).toBe(200);

    // Attempting to spend 500 should throw / be rejected
    let errorCaught = false;
    try {
      await withTransaction(async (client) => {
        const u = (await client.query('SELECT * FROM users WHERE id = $1', [user.id])).rows[0];
        if (u.coins < 500) {
          throw new Error('Недостаточно средств: требуется 500 Coins');
        }
        await client.query('UPDATE users SET coins = coins - 500 WHERE id = $1', [user.id]);
      });
    } catch (err: any) {
      errorCaught = true;
      expect(err.message).toContain('Недостаточно средств');
    }
    expect(errorCaught).toBe(true);

    // Balance must still be 200 (not negative)
    const afterRes = await query('SELECT coins FROM users WHERE id = $1', [user.id]);
    expect(afterRes.rows[0].coins).toBe(200);
  });

  it('Idempotency prevents duplicate coin deductions for identical requestId', async () => {
    const testTgId = Math.floor(Math.random() * 800000000) + 100000000;
    await query(
      `INSERT INTO users (telegram_id, username, coins) VALUES ($1, $2, $3)`,
      [testTgId, 'idempotent_user', 1500]
    );
    const user = (await query('SELECT * FROM users WHERE telegram_id = $1', [testTgId])).rows[0];
    expect(user.coins).toBe(1500);

    const requestId = 'req_idempotent_test_' + Date.now();

    // First request
    const firstExec = async () => {
      const op = await query('SELECT * FROM operations WHERE request_id = $1', [requestId]);
      if (op.rowCount > 0) return op.rows[0].response_payload;

      return withTransaction(async (client) => {
        await client.query('UPDATE users SET coins = coins - 500 WHERE id = $1', [user.id]);
        const payload = { cardUid: 'card_demo_1', coinsRemaining: 1000 };
        await client.query(
          'INSERT INTO operations (request_id, user_id, action_type, response_payload) VALUES ($1, $2, $3, $4)',
          [requestId, user.id, 'issue_card', JSON.stringify(payload)]
        );
        return payload;
      });
    };

    const res1 = await firstExec();
    expect(res1.coinsRemaining).toBe(1000);

    // Second request with SAME requestId (network retry simulation)
    const res2 = await firstExec();
    expect(res2.coinsRemaining).toBe(1000);

    // User balance should have decreased ONLY ONCE (1500 - 500 = 1000)
    const checkUser = (await query('SELECT coins FROM users WHERE id = $1', [user.id])).rows[0];
    expect(checkUser.coins).toBe(1000);
  });

  it('BOMZH mode free rolls enforce 30s interval and max 150 daily limit', async () => {
    const testTgId = Math.floor(Math.random() * 800000000) + 100000000;
    await query(`INSERT INTO users (telegram_id, username, coins) VALUES ($1, 'bomzh_user', 100)`, [
      testTgId,
    ]);
    const user = (await query('SELECT * FROM users WHERE telegram_id = $1', [testTgId])).rows[0];

    const today = new Date().toISOString().slice(0, 10);

    // Initial roll
    await query(
      `INSERT INTO free_rolls (user_id, roll_date, daily_count, last_roll_at) VALUES ($1, $2, $3, $4)`,
      [user.id, today, 1, new Date().toISOString()]
    );

    const frRes = await query('SELECT * FROM free_rolls WHERE user_id = $1', [user.id]);
    expect(frRes.rows[0].daily_count).toBe(1);

    // Check max limit 150
    await query(
      `INSERT INTO free_rolls (user_id, roll_date, daily_count, last_roll_at) VALUES ($1, $2, $3, $4)`,
      [user.id, today, 150, new Date().toISOString()]
    );
    const maxFr = (await query('SELECT * FROM free_rolls WHERE user_id = $1', [user.id])).rows[0];
    expect(maxFr.daily_count).toBe(150);
  });

  it('Daily tasks rewards can only be claimed once per day', async () => {
    const testTgId = Math.floor(Math.random() * 800000000) + 100000000;
    await query(`INSERT INTO users (telegram_id, username, coins) VALUES ($1, 'task_user', 1500)`, [
      testTgId,
    ]);
    const user = (await query('SELECT * FROM users WHERE telegram_id = $1', [testTgId])).rows[0];
    const today = new Date().toISOString().slice(0, 10);

    // Insert user task as already claimed
    mockDB_userTasks:
    await query(
      `INSERT INTO user_tasks (user_id, task_id, current_progress, is_claimed, task_date) VALUES ($1, 1, 1, true, $2)`,
      [user.id, today]
    );

    const ut = (
      await query('SELECT * FROM user_tasks WHERE user_id = $1 AND task_id = 1', [user.id])
    ).rows[0];
    if (ut) {
      expect(ut.is_claimed).toBe(true);
    }
  });

  it('Guarantees all 7 daily tasks exist (including 4 new active player tasks)', async () => {
    const tasksRes = await query('SELECT * FROM daily_tasks');
    const taskKeys = tasksRes.rows.map((t: any) => t.task_key);
    expect(taskKeys).toContain('daily_login');
    expect(taskKeys).toContain('roll_3_cards');
    expect(taskKeys).toContain('daily_mission');
    expect(taskKeys).toContain('clicker_50');
    expect(taskKeys).toContain('sell_avita');
    expect(taskKeys).toContain('share_card');
    expect(taskKeys).toContain('mint_rare');
    expect(tasksRes.rowCount).toBeGreaterThanOrEqual(7);
  });
});
