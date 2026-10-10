import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { apiRouter } from '../server/src/routes.js';
import { authMiddleware, ADMIN_SECRET_PASSWORD } from '../server/src/auth.js';
import { initDatabase, query } from '../server/src/db.js';

const app = express();
app.use(express.json());
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path === '/telegram/webhook') return next();
  return authMiddleware(req as any, res, next);
}, apiRouter);

let server: Server;
let baseUrl = '';

describe('Leaderboard, Settings, and Admin Integration Tests', () => {
  beforeAll(async () => {
    await initDatabase();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          baseUrl = `http://localhost:${addr.port}/api`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('correctly retrieves leaderboard for coins, cards, and best_card', async () => {
    // 1. Coins category
    const resCoins = await fetch(`${baseUrl}/leaderboard?category=coins`);
    const dataCoins = await resCoins.json();
    expect(resCoins.status).toBe(200);
    expect(dataCoins.success).toBe(true);
    expect(dataCoins.category).toBe('coins');
    expect(Array.isArray(dataCoins.top)).toBe(true);
    expect(dataCoins.myPosition).toBeDefined();
    expect(dataCoins.myPosition.rank).toBeGreaterThanOrEqual(1);

    // 2. Cards category
    const resCards = await fetch(`${baseUrl}/leaderboard?category=cards`);
    const dataCards = await resCards.json();
    expect(resCards.status).toBe(200);
    expect(dataCards.success).toBe(true);
    expect(dataCards.category).toBe('cards');
    expect(Array.isArray(dataCards.top)).toBe(true);

    // 3. Best card category
    const resBest = await fetch(`${baseUrl}/leaderboard?category=best_card`);
    const dataBest = await resBest.json();
    expect(resBest.status).toBe(200);
    expect(dataBest.success).toBe(true);
    expect(dataBest.category).toBe('best_card');
    expect(Array.isArray(dataBest.top)).toBe(true);
  });

  it('reads and updates user settings including compact mode and onboarding', async () => {
    // Get initial settings
    const getRes = await fetch(`${baseUrl}/settings`);
    const getData = await getRes.json();
    expect(getRes.status).toBe(200);
    expect(getData.success).toBe(true);
    expect(getData.settings).toBeDefined();

    // Update settings
    const postRes = await fetch(`${baseUrl}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soundEnabled: false,
        hapticsEnabled: true,
        compactMode: true,
        onboardingCompleted: true,
      }),
    });
    const postData = await postRes.json();
    expect(postRes.status).toBe(200);
    expect(postData.success).toBe(true);
    expect(postData.settings.soundEnabled).toBe(false);
    expect(postData.settings.compactMode).toBe(true);
    expect(postData.settings.onboardingCompleted).toBe(true);
  });

  it('admin verification works with secret password and blocks unauthorized access', async () => {
    // 1. Password verification endpoint
    const verifyValid = await fetch(`${baseUrl}/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_SECRET_PASSWORD }),
    });
    const validData = await verifyValid.json();
    expect(verifyValid.status).toBe(200);
    expect(validData.isAdmin).toBe(true);

    const verifyInvalid = await fetch(`${baseUrl}/admin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong-password' }),
    });
    const invalidData = await verifyInvalid.json();
    expect(verifyInvalid.status).toBe(200);
    expect(invalidData.isAdmin).toBe(false);

    // 2. Admin endpoint with password header
    const authorized = await fetch(`${baseUrl}/admin/stats`, {
      headers: { 'x-admin-password': encodeURIComponent(ADMIN_SECRET_PASSWORD) },
    });
    const statsData = await authorized.json();
    expect(authorized.status).toBe(200);
    expect(statsData.success).toBe(true);
    expect(statsData.stats).toBeDefined();
  });

  it('admin can adjust user balance with a reason and creates audit log', async () => {
    // Ensure test user exists via authenticated endpoint
    await fetch(`${baseUrl}/settings`);
    const uRes = await query('SELECT id, coins FROM users LIMIT 1');
    expect(uRes.rows.length).toBeGreaterThan(0);
    const targetUserId = uRes.rows[0].id;
    const initialCoins = uRes.rows[0].coins;

    const adjustRes = await fetch(`${baseUrl}/admin/adjust-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': encodeURIComponent(ADMIN_SECRET_PASSWORD),
      },
      body: JSON.stringify({
        targetUserId,
        amount: 500,
        reason: 'Бонус за бета-тестирование лидерборда',
      }),
    });
    const adjustData = await adjustRes.json();
    expect(adjustRes.status).toBe(200);
    expect(adjustData.success).toBe(true);
    expect(adjustData.newCoins).toBe(initialCoins + 500);

    // Check audit logs
    const auditRes = await fetch(`${baseUrl}/admin/audit-logs`, {
      headers: { 'x-admin-password': encodeURIComponent(ADMIN_SECRET_PASSWORD) },
    });
    const auditData = await auditRes.json();
    expect(auditRes.status).toBe(200);
    expect(auditData.success).toBe(true);
    expect(auditData.logs.length).toBeGreaterThanOrEqual(1);
    expect(auditData.logs[0].action).toBe('adjust_balance');
  });
});
