import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

export interface DBClient {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
  release?: () => void;
}

let pool: pg.Pool | null = null;
let isMockMode = false;

export function getIsMockMode(): boolean {
  return isMockMode || !pool;
}

export function getMockDB(): MockDB {
  return mockDB;
}

// Mock Store for dev / testing when PostgreSQL server is not locally running
export interface MockDB {
  users: any[];
  cards: any[];
  card_templates: any[];
  albums: any[];
  user_albums: any[];
  daily_tasks: any[];
  user_tasks: any[];
  free_rolls: any[];
  operations: any[];
  coin_ledger: any[];
  cosmetic_items: any[];
  user_cosmetics: any[];
  star_payments: any[];
  user_favorites: any[];
  user_settings: any[];
  avita_sessions: any[];
  avita_deals: any[];
  user_clicker: any[];
  admin_audit_log: any[];
  leaderboard_history: any[];
  market_listings: any[];
  market_deals_history: any[];
  promo_codes: any[];
  user_promo_activations: any[];
}

const mockDbPath = path.resolve(process.cwd(), 'data_local_store.json');

function loadMockData(): MockDB {
  const defaultData: MockDB = {
    users: [],
    cards: [],
    card_templates: [],
    albums: [
      { id: 1, name: 'Банковский Альянс', description: 'Соберите карты всех 5 банков', category: 'banks', required_count: 5, reward_coins: 500 },
      { id: 2, name: 'Материалы Будущего', description: 'Соберите все 6 видов материалов', category: 'materials', required_count: 6, reward_coins: 1000 },
      { id: 3, name: 'Клуб Счастливчиков', description: 'Соберите 3 редких номерных узора', category: 'rarities', required_count: 3, reward_coins: 1500 }
    ],
    user_albums: [],
    daily_tasks: [
      { id: 1, task_key: 'daily_login', title: 'Войти в игру', reward_coins: 50, target_count: 1, task_type: 'login' },
      { id: 2, task_key: 'roll_3_cards', title: 'Выпустить три карты', reward_coins: 150, target_count: 3, task_type: 'rolls' },
      { id: 3, task_key: 'daily_mission', title: 'Задание дня', reward_coins: 300, target_count: 1, task_type: 'mission' },
      { id: 4, task_key: 'clicker_50', title: 'Сделать 50 кликов по монете', reward_coins: 100, target_count: 50, task_type: 'clicker' },
      { id: 5, task_key: 'sell_avita', title: 'Продать карту скупщику Авита', reward_coins: 150, target_count: 1, task_type: 'avita' },
      { id: 6, task_key: 'share_card', title: 'Поделиться картой с другом', reward_coins: 100, target_count: 1, task_type: 'share' },
      { id: 7, task_key: 'mint_rare', title: 'Выбить карту Gold или выше', reward_coins: 250, target_count: 1, task_type: 'mint_rare' },
    ],
    user_tasks: [],
    free_rolls: [],
    operations: [],
    coin_ledger: [],
    cosmetic_items: [
      { id: 1, item_key: 'holder_classic', name: 'Холдер карты', type: 'holder', price_stars: 5, description: 'Премиальный матовый холдер для презентации вашей карты', preview_meta: { color: '#1C1E24', border: '#3B4252' } },
      { id: 2, item_key: 'frame_vip', name: 'Рамка профиля', type: 'frame', price_stars: 10, description: 'Эксклюзивная золотая окантовка аватара профиля', preview_meta: { border: '#D4AF37', glow: 'rgba(212,175,55,0.4)' } },
      { id: 3, item_key: 'effect_digits_matrix', name: 'Эффект цифр', type: 'digit_fx', price_stars: 10, description: 'Кибернетическое неоновое мерцание цифр при выпадении', preview_meta: { glowColor: '#00FFCC', font: 'Space Mono' } },
      { id: 4, item_key: 'bg_luxury_onyx', name: 'Фон профиля', type: 'profile_bg', price_stars: 15, description: 'Глубокий текстурированный оникс с карбоновым тиснением', preview_meta: { gradient: 'linear-gradient(180deg, #0D0E12 0%, #171A21 100%)' } },
      { id: 5, item_key: 'bundle_black_vip', name: 'Комплект оформления', type: 'bundle', price_stars: 25, description: 'Полный набор: Холдер, Золотая Рамка, Эффект Цифр и Фон Оникс', preview_meta: { includes: ['holder_classic', 'frame_vip', 'effect_digits_matrix', 'bg_luxury_onyx'] } }
    ],
    user_cosmetics: [],
    star_payments: [],
    user_favorites: [],
    user_settings: [],
    avita_sessions: [],
    avita_deals: [],
    user_clicker: [],
    admin_audit_log: [],
    leaderboard_history: [],
    market_listings: [],
    market_deals_history: [],
    promo_codes: [
      { id: 1, code: 'START5000', reward_type: 'coins', reward_value: '5000', max_uses: 0, uses_count: 0, is_active: true, created_at: new Date().toISOString() },
      { id: 2, code: 'VIPCARD', reward_type: 'coins', reward_value: '10000', max_uses: 0, uses_count: 0, is_active: true, created_at: new Date().toISOString() },
      { id: 3, code: 'DROPMARKET', reward_type: 'coins', reward_value: '3000', max_uses: 0, uses_count: 0, is_active: true, created_at: new Date().toISOString() },
      { id: 4, code: 'ONYX', reward_type: 'cosmetic', reward_value: 'bg_luxury_onyx', max_uses: 0, uses_count: 0, is_active: true, created_at: new Date().toISOString() },
    ],
    user_promo_activations: []
  };

  try {
    if (fs.existsSync(mockDbPath)) {
      const parsed = JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
      const existingTasks = Array.isArray(parsed.daily_tasks) ? parsed.daily_tasks : [];
      for (const dt of defaultData.daily_tasks) {
        if (!existingTasks.some((t: any) => t.task_key === dt.task_key)) {
          existingTasks.push(dt);
        }
      }
      const existingPromos = Array.isArray(parsed.promo_codes) ? parsed.promo_codes : [];
      for (const dp of defaultData.promo_codes) {
        if (!existingPromos.some((p: any) => p.code === dp.code)) {
          existingPromos.push(dp);
        }
      }
      return {
        ...defaultData,
        ...parsed,
        daily_tasks: existingTasks,
        cards: Array.isArray(parsed.cards) ? parsed.cards.map((c: any) => ({
          ...c,
          is_listed_on_market: Boolean(c.is_listed_on_market)
        })) : [],
        user_clicker: Array.isArray(parsed.user_clicker) ? parsed.user_clicker : [],
        avita_sessions: Array.isArray(parsed.avita_sessions) ? parsed.avita_sessions : [],
        avita_deals: Array.isArray(parsed.avita_deals) ? parsed.avita_deals : [],
        admin_audit_log: Array.isArray(parsed.admin_audit_log) ? parsed.admin_audit_log : [],
        leaderboard_history: Array.isArray(parsed.leaderboard_history) ? parsed.leaderboard_history : [],
        market_listings: Array.isArray(parsed.market_listings) ? parsed.market_listings : [],
        market_deals_history: Array.isArray(parsed.market_deals_history) ? parsed.market_deals_history : [],
        promo_codes: existingPromos,
        user_promo_activations: Array.isArray(parsed.user_promo_activations) ? parsed.user_promo_activations : []
      };
    }
  } catch (err) {
    console.warn('Failed to load local mock DB, resetting:', err);
  }

  return defaultData;
}

let mockDB = loadMockData();

function saveMockData() {
  try {
    fs.writeFileSync(mockDbPath, JSON.stringify(mockDB, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save mock DB:', err);
  }
}

/**
 * Initialize Database connection & migrations
 */
export async function initDatabase(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString) {
    try {
      console.log('Connecting to PostgreSQL...');
      pool = new Pool({
        connectionString,
        ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
      });

      // Test connection
      await pool.query('SELECT 1');
      console.log('PostgreSQL connected successfully.');

      // Run all migrations in order
      const migrationsDir = path.resolve(__dirname, '../migrations');
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
        for (const file of files) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          await pool.query(sql);
          console.log(`Migration ${file} applied successfully.`);
        }
      }
      return;
    } catch (err) {
      console.warn('PostgreSQL connection failed. Falling back to local storage engine:', err);
      pool = null;
    }
  }

  console.log('Operating in Local Resilient Storage Mode (Zero external dependencies).');
  isMockMode = true;
}

/**
 * Executes a query
 */
export async function query(text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  if (pool && !isMockMode) {
    const res = await pool.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
  }

  // Handle mock SQL executor
  return executeMockQuery(text, params);
}

/**
 * Executes transaction
 */
export async function withTransaction<T>(callback: (client: DBClient) => Promise<T>): Promise<T> {
  if (pool && !isMockMode) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  // Mock transaction
  const client: DBClient = {
    query: (text, params) => executeMockQuery(text, params)
  };
  return callback(client);
}

/**
 * Mock Query Engine for Local Dev and Vitest tests
 */
function executeMockQuery(sql: string, params: any[] = []): { rows: any[]; rowCount: number } {
  if (!mockDB.user_clicker) mockDB.user_clicker = [];
  if (!mockDB.avita_sessions) mockDB.avita_sessions = [];
  if (!mockDB.avita_deals) mockDB.avita_deals = [];
  if (!mockDB.user_settings) mockDB.user_settings = [];
  if (!mockDB.admin_audit_log) mockDB.admin_audit_log = [];
  if (!mockDB.leaderboard_history) mockDB.leaderboard_history = [];
  if (!mockDB.market_listings) mockDB.market_listings = [];
  if (!mockDB.market_deals_history) mockDB.market_deals_history = [];
  if (!mockDB.promo_codes) mockDB.promo_codes = [];
  if (!mockDB.user_promo_activations) mockDB.user_promo_activations = [];

  const trimmed = sql.trim().toUpperCase();

  // Normalize query
  if (trimmed.startsWith('SELECT 1')) {
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  }

  // 1. Users Queries
  if (sql.includes('FROM users WHERE telegram_id =')) {
    const tgId = params[0];
    const user = mockDB.users.find(u => Number(u.telegram_id) === Number(tgId));
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  if (sql.includes('FROM users WHERE id =') || sql.includes('SELECT coins FROM users WHERE id =') || sql.includes('SELECT * FROM users WHERE id =')) {
    const id = params[0];
    const user = mockDB.users.find(u => Number(u.id) === Number(id));
    return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
  }

  if (sql.includes('FROM users') && !sql.includes('WHERE')) {
    return { rows: mockDB.users.slice(0, 100), rowCount: mockDB.users.length };
  }

  if (sql.includes('INSERT INTO users')) {
    const tgId = params[0];
    const username = params[1];
    let customCoins = 5000;
    const coinsMatch = sql.match(/VALUES\s*\([^,]+,[^,]+,\s*(\d+)\)/i);
    if (coinsMatch) {
      customCoins = parseInt(coinsMatch[1], 10);
    } else if (params.length >= 3 && typeof params[2] === 'number') {
      customCoins = params[2];
    }
    const firstName = typeof params[2] === 'string' ? params[2] : 'Player';
    const lastName = params[3] || '';
    const photoUrl = params[4] || '';
    
    let user = mockDB.users.find(u => Number(u.telegram_id) === Number(tgId));
    if (!user) {
      const maxUserId = mockDB.users.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0);
      user = {
        id: maxUserId + 1,
        telegram_id: Number(tgId),
        username: username || 'user',
        first_name: firstName,
        last_name: lastName,
        photo_url: photoUrl,
        coins: customCoins,
        level: 1,
        exp: 0,
        prefix: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockDB.users.push(user);
      saveMockData();
    } else if (typeof params[2] === 'number') {
      user.coins = params[2];
      saveMockData();
    }
    return { rows: [user], rowCount: 1 };
  }

  if (sql.includes('UPDATE users SET prefix =')) {
    const newPrefix = params[0];
    const userId = params[params.length - 1];
    const user = mockDB.users.find(u => Number(u.id) === Number(userId));
    if (user) {
      user.prefix = newPrefix ? String(newPrefix).trim() : null;
      user.updated_at = new Date().toISOString();
      saveMockData();
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE users SET coins = coins -')) {
    const amountMatch = sql.match(/coins\s*-\s*(\d+)/i);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : Number(params[0] ?? 500);
    const userId = params[params.length - 1];
    const user = mockDB.users.find(u => Number(u.id) === Number(userId));
    if (user) {
      user.coins -= amount;
      user.updated_at = new Date().toISOString();
      saveMockData();
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE users SET coins = coins +')) {
    const amountMatch = sql.match(/coins\s*\+\s*(\d+)/i);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : Number(params[0]);
    const userId = params[params.length - 1];
    const user = mockDB.users.find(u => Number(u.id) === Number(userId));
    if (user) {
      user.coins += amount;
      user.updated_at = new Date().toISOString();
      saveMockData();
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE users SET coins =')) {
    const newCoins = params[0];
    const userId = params[params.length - 1];
    const user = mockDB.users.find(u => u.id === Number(userId));
    if (user) {
      user.coins = Number(newCoins);
      user.updated_at = new Date().toISOString();
      saveMockData();
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 2. Operations (Idempotency)
  if (sql.includes('FROM operations WHERE request_id =')) {
    const reqId = params[0];
    const op = mockDB.operations.find(o => o.request_id === reqId);
    return { rows: op ? [op] : [], rowCount: op ? 1 : 0 };
  }

  if (sql.includes('INSERT INTO operations')) {
    const [reqId, userId, actionType, payload] = params;
    const op = {
      id: mockDB.operations.length + 1,
      request_id: reqId,
      user_id: Number(userId),
      action_type: actionType,
      response_payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      created_at: new Date().toISOString()
    };
    mockDB.operations.push(op);
    saveMockData();
    return { rows: [op], rowCount: 1 };
  }

  // 3. Cards Queries
  if (sql.includes('INSERT INTO cards')) {
    const [cardUid, userId, bank, material, category, cardNumber, code, expiresAt, score, isFree, serialNum] = params;
    const maxCardId = mockDB.cards.reduce((max, c) => Math.max(max, Number(c.id) || 0), 0);
    const cardId = maxCardId + 1;
    const serial = serialNum || `CD-${String(cardId).padStart(6, '0')}`;
    const card = {
      id: cardId,
      card_uid: cardUid,
      user_id: Number(userId),
      bank,
      material,
      category,
      card_number: cardNumber,
      collection_code: code,
      expires_at: expiresAt,
      collector_score: Number(score),
      is_free_roll: Boolean(isFree),
      serial_number: serial,
      is_listed_on_market: false,
      created_at: new Date().toISOString()
    };
    mockDB.cards.push(card);
    saveMockData();
    return { rows: [card], rowCount: 1 };
  }

  if (sql.includes('FROM cards WHERE user_id =') && sql.includes('ORDER BY created_at DESC')) {
    const userId = params[0];
    let userCards = mockDB.cards
      .filter(c => c.user_id === Number(userId) && !c.is_sold)
      .map(c => ({
        ...c,
        is_listed_on_market: Boolean(c.is_listed_on_market),
        serial_number: c.serial_number || `CD-${String(c.id).padStart(6, '0')}`
      }));
    
    // Check filters
    if (sql.includes('bank =')) {
      const bankParam = params.find(p => ['Алфа Банк', 'ЗверьБанк', 'ОзановБанк', 'Тинькоффи', 'ОООтмыв Банк'].includes(p));
      if (bankParam) userCards = userCards.filter(c => c.bank === bankParam);
    }
    if (sql.includes('material =')) {
      const matParam = params.find(p => ['Classic Plastic', 'Matte Plastic', 'Gold', 'Black Carbon', 'Titanium', 'Holographic'].includes(p));
      if (matParam) userCards = userCards.filter(c => c.material === matParam);
    }

    userCards.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: userCards, rowCount: userCards.length };
  }

  if (sql.includes('FROM cards WHERE id = ANY(') || sql.includes('FROM cards WHERE id IN (')) {
    const ids = Array.isArray(params[0]) ? params[0].map(Number) : params.map(Number);
    const matched = mockDB.cards.filter(c => ids.includes(Number(c.id))).map(c => ({
      ...c,
      is_listed_on_market: Boolean(c.is_listed_on_market)
    }));
    return { rows: matched, rowCount: matched.length };
  }

  if (sql.includes('FROM cards WHERE id =') || sql.includes('FROM cards WHERE card_uid =')) {
    const idOrUid = params[0];
    const card = mockDB.cards.find(c => c.id === Number(idOrUid) || c.card_uid === idOrUid);
    if (card) {
      return {
        rows: [{
          ...card,
          is_listed_on_market: Boolean(card.is_listed_on_market)
        }],
        rowCount: 1
      };
    }
    return { rows: [], rowCount: 0 };
  }

  // 4. Free Rolls (BOMZH Mode)
  if (sql.includes('FROM free_rolls WHERE user_id =')) {
    const userId = params[0];
    const today = new Date().toISOString().slice(0, 10);
    const fr = mockDB.free_rolls.find(f => Number(f.user_id) === Number(userId) && f.roll_date === today);
    return { rows: fr ? [fr] : [], rowCount: fr ? 1 : 0 };
  }

  if (sql.includes('INSERT INTO free_rolls')) {
    const userId = params[0];
    let count = 1;
    let lastAt = new Date().toISOString();
    if (params.length >= 4) {
      count = Number(params[2]);
      lastAt = params[3];
    } else if (params.length >= 2) {
      count = Number(params[1]);
      lastAt = params[2] || lastAt;
    }

    const today = new Date().toISOString().slice(0, 10);
    let fr = mockDB.free_rolls.find(f => Number(f.user_id) === Number(userId) && f.roll_date === today);
    if (!fr) {
      fr = { id: mockDB.free_rolls.length + 1, user_id: Number(userId), roll_date: today, daily_count: count, last_roll_at: lastAt };
      mockDB.free_rolls.push(fr);
    } else {
      fr.daily_count = count;
      fr.last_roll_at = lastAt;
    }
    saveMockData();
    return { rows: [fr], rowCount: 1 };
  }

  // 5. Tasks
  if (sql.includes('FROM daily_tasks')) {
    return { rows: mockDB.daily_tasks, rowCount: mockDB.daily_tasks.length };
  }

  if (sql.includes('FROM user_tasks WHERE user_id =')) {
    const userId = params[0];
    let userTasks = mockDB.user_tasks.filter(t => t.user_id === Number(userId));
    if (sql.includes('task_id =') && params.length >= 2) {
      const taskId = params[1];
      userTasks = userTasks.filter(t => Number(t.task_id) === Number(taskId));
    }
    if (sql.includes('task_date =')) {
      const taskDate = params[params.length - 1];
      userTasks = userTasks.filter(t => t.task_date === taskDate);
    }
    return { rows: userTasks, rowCount: userTasks.length };
  }

  if (sql.includes('INSERT INTO user_tasks')) {
    // Support mix of literals and params, e.g. VALUES ($1, 1, 1, true, $2) or VALUES ($1, $2, $3, false, $4)
    const valuesMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    let userId = params[0];
    let taskId = 1;
    let progress = 0;
    let isClaimed = false;
    let taskDate = new Date().toISOString().slice(0, 10);

    if (valuesMatch) {
      const parts = valuesMatch[1].split(',').map(s => s.trim());
      const resolvePart = (part: string) => {
        if (part.startsWith('$')) {
          const idx = parseInt(part.slice(1), 10) - 1;
          return params[idx];
        }
        if (part === 'true') return true;
        if (part === 'false') return false;
        if (!isNaN(Number(part))) return Number(part);
        return part.replace(/^['"]|['"]$/g, '');
      };

      if (parts.length >= 5) {
        userId = Number(resolvePart(parts[0]));
        taskId = Number(resolvePart(parts[1]));
        progress = Number(resolvePart(parts[2]) || 0);
        isClaimed = Boolean(resolvePart(parts[3]));
        taskDate = String(resolvePart(parts[4]) || taskDate);
      }
    } else {
      userId = Number(params[0]);
      taskId = Number(params[1] || 1);
      progress = Number(params[2] || 0);
      isClaimed = Boolean(params[3]);
      taskDate = params[4] || taskDate;
    }

    const newTask = {
      id: mockDB.user_tasks.length + 1,
      user_id: userId,
      task_id: taskId,
      current_progress: progress,
      is_claimed: isClaimed,
      task_date: taskDate,
      created_at: new Date().toISOString()
    };
    mockDB.user_tasks.push(newTask);
    saveMockData();
    return { rows: [newTask], rowCount: 1 };
  }

  if (sql.includes('UPDATE user_tasks SET is_claimed = true')) {
    const taskId = params[0];
    const ut = mockDB.user_tasks.find(t => Number(t.id) === Number(taskId));
    if (ut) {
      ut.is_claimed = true;
      saveMockData();
      return { rows: [ut], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE user_tasks SET current_progress =')) {
    let progress = 1;
    let recordId: any;
    if (params.length >= 2) {
      progress = Number(params[0]);
      recordId = params[1];
    } else {
      const match = sql.match(/current_progress\s*=\s*(\d+)/i);
      if (match) progress = Number(match[1]);
      recordId = params[0];
    }
    const ut = mockDB.user_tasks.find(t => Number(t.id) === Number(recordId));
    if (ut) {
      ut.current_progress = progress;
      saveMockData();
      return { rows: [ut], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 6. Shop & Cosmetics
  if (sql.includes('FROM cosmetic_items')) {
    return { rows: mockDB.cosmetic_items, rowCount: mockDB.cosmetic_items.length };
  }

  if (sql.includes('FROM user_cosmetics WHERE user_id =')) {
    const userId = params[0];
    const uCosmetics = mockDB.user_cosmetics.filter(uc => uc.user_id === Number(userId));
    return { rows: uCosmetics, rowCount: uCosmetics.length };
  }

  // 7. Favorites
  if (sql.includes('FROM user_favorites WHERE user_id =')) {
    const userId = params[0];
    const favs = mockDB.user_favorites.filter(f => f.user_id === Number(userId));
    return { rows: favs, rowCount: favs.length };
  }

  // 8. Albums
  if (sql.includes('FROM albums')) {
    return { rows: mockDB.albums, rowCount: mockDB.albums.length };
  }

  // 9. Avita Cooldown and Users updates
  if (sql.includes('UPDATE users SET avita_blocked_until =')) {
    const until = params[0];
    const userId = params[params.length - 1];
    const user = mockDB.users.find(u => Number(u.id) === Number(userId));
    if (user) {
      user.avita_blocked_until = until;
      saveMockData();
      return { rows: [user], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 10. Avita Sessions
  if (sql.includes('FROM avita_sessions WHERE session_id =')) {
    const sId = params[0];
    const s = mockDB.avita_sessions.find(item => item.session_id === sId);
    return { rows: s ? [s] : [], rowCount: s ? 1 : 0 };
  }

  if (sql.includes('INSERT INTO avita_sessions')) {
    const [sId, userId, cardIds, initOffer, currOffer, maxOffer, rounds, status, hist] = params;
    const session = {
      id: mockDB.avita_sessions.length + 1,
      session_id: sId,
      user_id: Number(userId),
      card_ids: typeof cardIds === 'string' ? JSON.parse(cardIds) : cardIds,
      initial_offer: Number(initOffer),
      current_offer: Number(currOffer),
      max_offer: Number(maxOffer),
      rounds_used: Number(rounds || 0),
      status: status || 'active',
      dialog_history: typeof hist === 'string' ? JSON.parse(hist) : hist || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    mockDB.avita_sessions.push(session);
    saveMockData();
    return { rows: [session], rowCount: 1 };
  }

  if (sql.includes('UPDATE avita_sessions')) {
    const sId = params[params.length - 1];
    const session = mockDB.avita_sessions.find(item => item.session_id === sId);
    if (session) {
      if (sql.includes('current_offer =')) session.current_offer = Number(params[0]);
      if (sql.includes('rounds_used =')) session.rounds_used = Number(params[1]);
      if (sql.includes('status =')) session.status = params[2] || session.status;
      if (sql.includes('dialog_history =')) {
        const histParam = params.find(p => typeof p === 'string' && (p.startsWith('[') || p.startsWith('{')));
        if (histParam) session.dialog_history = JSON.parse(histParam);
      }
      session.updated_at = new Date().toISOString();
      saveMockData();
      return { rows: [session], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 11. Cards Sold Update
  if (sql.includes('UPDATE cards SET is_sold = true')) {
    const price = params[0];
    // card ids might be in WHERE id = ANY($2) or WHERE id = $2
    const targetIds: number[] = [];
    for (let i = 1; i < params.length; i++) {
      if (Array.isArray(params[i])) targetIds.push(...params[i].map(Number));
      else if (typeof params[i] === 'number') targetIds.push(params[i]);
    }
    const updated: any[] = [];
    for (const card of mockDB.cards) {
      if (targetIds.includes(Number(card.id))) {
        card.is_sold = true;
        card.sold_price = Number(price);
        card.sold_at = new Date().toISOString();
        updated.push(card);
      }
    }
    saveMockData();
    return { rows: updated, rowCount: updated.length };
  }

  // 12. Avita Deals
  if (sql.includes('INSERT INTO avita_deals')) {
    const [dealId, userId, cardCount, summary, finalPrice, status] = params;
    const deal = {
      id: mockDB.avita_deals.length + 1,
      deal_id: dealId,
      user_id: Number(userId),
      card_count: Number(cardCount),
      cards_summary: typeof summary === 'string' ? JSON.parse(summary) : summary,
      final_price: Number(finalPrice),
      status: status || 'completed',
      created_at: new Date().toISOString()
    };
    mockDB.avita_deals.push(deal);
    saveMockData();
    return { rows: [deal], rowCount: 1 };
  }

  if (sql.includes('FROM avita_deals WHERE user_id =')) {
    const userId = params[0];
    const deals = mockDB.avita_deals.filter(d => Number(d.user_id) === Number(userId));
    return { rows: deals, rowCount: deals.length };
  }

  // 13. User Clicker Queries
  if (sql.includes('FROM user_clicker WHERE user_id =')) {
    const userId = params[0];
    let c = mockDB.user_clicker.find(item => Number(item.user_id) === Number(userId));
    if (!c) {
      c = {
        id: mockDB.user_clicker.length + 1,
        user_id: Number(userId),
        power_level: 1,
        recharge_level: 1,
        current_energy: 100,
        last_energy_updated_at: new Date().toISOString(),
        last_daily_help_at: null,
        total_clicks: 0,
        claimed_tasks: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockDB.user_clicker.push(c);
      saveMockData();
    }
    return { rows: [c], rowCount: 1 };
  }

  if (sql.includes('INSERT INTO user_clicker')) {
    const userId = params[0];
    let c = mockDB.user_clicker.find(item => Number(item.user_id) === Number(userId));
    if (!c) {
      c = {
        id: mockDB.user_clicker.length + 1,
        user_id: Number(userId),
        power_level: 1,
        recharge_level: 1,
        current_energy: 100,
        last_energy_updated_at: new Date().toISOString(),
        last_daily_help_at: null,
        total_clicks: 0,
        claimed_tasks: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      mockDB.user_clicker.push(c);
      saveMockData();
    }
    return { rows: [c], rowCount: 1 };
  }

  if (sql.includes('UPDATE user_clicker SET')) {
    const userId = params[params.length - 1];
    let c = mockDB.user_clicker.find(item => Number(item.user_id) === Number(userId) || Number(item.id) === Number(userId));
    if (c) {
      if (sql.includes('power_level = $1')) {
        c.power_level = Number(params[0]);
      } else if (sql.includes('recharge_level = $1')) {
        c.recharge_level = Number(params[0]);
      } else if (sql.includes('claimed_tasks = $1')) {
        c.claimed_tasks = Array.isArray(params[0]) ? params[0] : (typeof params[0] === 'string' ? JSON.parse(params[0]) : []);
      } else if (sql.includes('current_energy = $1')) {
        c.current_energy = Number(params[0]);
        if (params.length >= 3 && sql.includes('last_energy_updated_at = $2')) {
          c.last_energy_updated_at = params[1];
        }
        if (sql.includes('total_clicks = total_clicks +')) {
          const match = sql.match(/total_clicks \+ (\d+)/);
          const add = match ? parseInt(match[1], 10) : 1;
          c.total_clicks = (c.total_clicks || 0) + add;
        }
      } else if (sql.includes('last_daily_help_at = $1')) {
        c.last_daily_help_at = params[0];
      }
      c.updated_at = new Date().toISOString();
      saveMockData();
      return { rows: [c], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 14. User Settings Queries
  if (sql.includes('FROM user_settings WHERE user_id =')) {
    const userId = params[0];
    let s = mockDB.user_settings.find(item => Number(item.user_id) === Number(userId));
    if (!s) {
      s = {
        user_id: Number(userId),
        sound_enabled: true,
        haptics_enabled: true,
        animations_enabled: true,
        notifications_enabled: true,
        compact_mode: false,
        onboarding_completed: false,
        updated_at: new Date().toISOString()
      };
      mockDB.user_settings.push(s);
      saveMockData();
    }
    return { rows: [s], rowCount: 1 };
  }

  if (sql.includes('INSERT INTO user_settings') || sql.includes('UPDATE user_settings')) {
    const userId = Number(params[0]);
    let s = mockDB.user_settings.find(item => Number(item.user_id) === userId);
    if (!s) {
      s = {
        user_id: userId,
        sound_enabled: params[1] ?? true,
        haptics_enabled: params[2] ?? true,
        animations_enabled: params[3] ?? true,
        notifications_enabled: params[4] ?? true,
        compact_mode: params[5] ?? false,
        onboarding_completed: params[6] ?? false,
        updated_at: new Date().toISOString()
      };
      mockDB.user_settings.push(s);
    } else {
      if (params.length >= 6) {
        s.sound_enabled = params[1] ?? s.sound_enabled;
        s.haptics_enabled = params[2] ?? s.haptics_enabled;
        s.animations_enabled = params[3] ?? s.animations_enabled;
        s.notifications_enabled = params[4] ?? s.notifications_enabled;
        s.compact_mode = params[5] ?? s.compact_mode;
        if (params[6] !== undefined) s.onboarding_completed = params[6];
      }
      s.updated_at = new Date().toISOString();
    }
    saveMockData();
    return { rows: [s], rowCount: 1 };
  }

  // 15. Admin Audit Log Queries
  if (sql.includes('INSERT INTO admin_audit_log')) {
    const [adminTgId, action, targetUserId, reason, details] = params;
    const logEntry = {
      id: mockDB.admin_audit_log.length + 1,
      admin_telegram_id: Number(adminTgId),
      action: String(action),
      target_user_id: targetUserId ? Number(targetUserId) : null,
      reason: reason || '',
      details: typeof details === 'string' ? JSON.parse(details) : details || {},
      created_at: new Date().toISOString()
    };
    mockDB.admin_audit_log.unshift(logEntry);
    saveMockData();
    return { rows: [logEntry], rowCount: 1 };
  }

  if (sql.includes('FROM admin_audit_log')) {
    return { rows: mockDB.admin_audit_log.slice(0, 50), rowCount: mockDB.admin_audit_log.length };
  }

  // 16. Leaderboard History Queries
  if (sql.includes('FROM leaderboard_history WHERE user_id =') && sql.includes('category =')) {
    const [userId, cat] = params;
    const h = mockDB.leaderboard_history.find(item => Number(item.user_id) === Number(userId) && item.category === cat);
    return { rows: h ? [h] : [], rowCount: h ? 1 : 0 };
  }

  if (sql.includes('INSERT INTO leaderboard_history') || sql.includes('UPDATE leaderboard_history')) {
    const [userId, cat, pos] = params;
    let h = mockDB.leaderboard_history.find(item => Number(item.user_id) === Number(userId) && item.category === cat);
    if (!h) {
      h = { user_id: Number(userId), category: cat, last_position: Number(pos), updated_at: new Date().toISOString() };
      mockDB.leaderboard_history.push(h);
    } else {
      h.last_position = Number(pos);
      h.updated_at = new Date().toISOString();
    }
    saveMockData();
    return { rows: [h], rowCount: 1 };
  }

  // 17. Cards Market Status Updates
  if (sql.includes('UPDATE cards SET is_listed_on_market =')) {
    let isListed = false;
    let cardId: any;
    if (sql.includes('is_listed_on_market = true')) {
      isListed = true;
      cardId = params[0];
    } else if (sql.includes('is_listed_on_market = false')) {
      isListed = false;
      cardId = params[0];
    } else {
      isListed = Boolean(params[0]);
      cardId = params[params.length - 1];
    }
    const card = mockDB.cards.find(c => Number(c.id) === Number(cardId));
    if (card) {
      card.is_listed_on_market = isListed;
      saveMockData();
      return { rows: [card], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE cards SET user_id =') && sql.includes('is_listed_on_market = false')) {
    const newUserId = params[0];
    const cardId = params[params.length - 1];
    const card = mockDB.cards.find(c => Number(c.id) === Number(cardId));
    if (card) {
      card.user_id = Number(newUserId);
      card.is_listed_on_market = false;
      saveMockData();
      return { rows: [card], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 18. Market Listings Queries
  if (sql.includes('INSERT INTO market_listings')) {
    let sellerId = params[0];
    let cardId = params[1];
    let price = params[2];
    let feePercent = params[3];
    let status = 'active';
    let expiresAt: any;
    if (sql.includes("'active'")) {
      status = 'active';
      expiresAt = params[4];
    } else if (params.length >= 6) {
      status = params[4] || 'active';
      expiresAt = params[5];
    } else {
      expiresAt = params[4];
    }
    const listingId = mockDB.market_listings.length + 1;
    const listing = {
      id: listingId,
      seller_id: Number(sellerId),
      card_id: Number(cardId),
      price: Number(price),
      fee_percent: Number(feePercent || 3.0),
      status: status || 'active',
      created_at: new Date().toISOString(),
      expires_at: expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
      sold_at: null,
      buyer_id: null
    };
    mockDB.market_listings.push(listing);
    saveMockData();
    return { rows: [listing], rowCount: 1 };
  }

  if (sql.includes('FROM market_listings') && (sql.includes('WHERE id =') || sql.includes('WHERE ml.id ='))) {
    const id = params[0];
    const listing = mockDB.market_listings.find(l => Number(l.id) === Number(id));
    if (!listing) return { rows: [], rowCount: 0 };
    const card = mockDB.cards.find(c => Number(c.id) === Number(listing.card_id));
    const seller = mockDB.users.find(u => Number(u.id) === Number(listing.seller_id));
    const enriched = {
      ...listing,
      card_number: card?.card_number || '',
      bank: card?.bank || '',
      material: card?.material || '',
      category: card?.category || '',
      collector_score: card?.collector_score || 0,
      serial_number: card?.serial_number || `CD-${String(card?.id).padStart(6, '0')}`,
      collection_code: card?.collection_code || '',
      expires_at_card: card?.expires_at || '',
      seller_username: seller?.username || 'user',
      seller_photo: seller?.photo_url || '',
      seller_prefix: seller?.prefix || null
    };
    return { rows: [enriched], rowCount: 1 };
  }

  if (sql.includes('FROM market_listings') && sql.includes('card_id =')) {
    const cardId = params[0];
    let listing: any;
    if (sql.includes("status = 'active'")) {
      listing = mockDB.market_listings.find(l => Number(l.card_id) === Number(cardId) && l.status === 'active');
    } else {
      listing = mockDB.market_listings.find(l => Number(l.card_id) === Number(cardId));
    }
    return { rows: listing ? [listing] : [], rowCount: listing ? 1 : 0 };
  }

  if (sql.includes('FROM market_listings') && (sql.includes('seller_id =') || sql.includes('ml.seller_id ='))) {
    const sellerId = params[0];
    const list = mockDB.market_listings
      .filter(l => Number(l.seller_id) === Number(sellerId))
      .map(listing => {
        const card = mockDB.cards.find(c => Number(c.id) === Number(listing.card_id));
        return {
          ...listing,
          card_number: card?.card_number || '',
          bank: card?.bank || '',
          material: card?.material || '',
          category: card?.category || '',
          collector_score: card?.collector_score || 0,
          serial_number: card?.serial_number || `CD-${String(card?.id).padStart(6, '0')}`,
          collection_code: card?.collection_code || ''
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: list, rowCount: list.length };
  }

  if (sql.includes('FROM market_listings')) {
    // General active market listings browse with filters
    let list = mockDB.market_listings.filter(l => l.status === 'active');
    // Check if expired
    const now = Date.now();
    list = list.filter(l => new Date(l.expires_at).getTime() > now);

    const enrichedList = list.map(listing => {
      const card = mockDB.cards.find(c => Number(c.id) === Number(listing.card_id));
      const seller = mockDB.users.find(u => Number(u.id) === Number(listing.seller_id));
      return {
        ...listing,
        card_number: card?.card_number || '',
        bank: card?.bank || '',
        material: card?.material || '',
        category: card?.category || '',
        collector_score: card?.collector_score || 0,
        serial_number: card?.serial_number || `CD-${String(card?.id).padStart(6, '0')}`,
        collection_code: card?.collection_code || '',
        seller_username: seller?.username || 'user',
        seller_photo: seller?.photo_url || '',
        seller_prefix: seller?.prefix || null
      };
    });

    enrichedList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: enrichedList, rowCount: enrichedList.length };
  }

  if (sql.includes('UPDATE market_listings SET price =')) {
    const newPrice = Number(params[0]);
    const listingId = params[params.length - 1];
    const listing = mockDB.market_listings.find(l => Number(l.id) === Number(listingId));
    if (listing) {
      listing.price = newPrice;
      saveMockData();
      return { rows: [listing], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE market_listings SET expires_at =')) {
    const newExpires = params[0];
    const listingId = params[params.length - 1];
    const listing = mockDB.market_listings.find(l => Number(l.id) === Number(listingId));
    if (listing) {
      listing.expires_at = newExpires;
      saveMockData();
      return { rows: [listing], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes("UPDATE market_listings SET status = 'cancelled'")) {
    const listingId = params[0];
    const listing = mockDB.market_listings.find(l => Number(l.id) === Number(listingId));
    if (listing) {
      listing.status = 'cancelled';
      saveMockData();
      return { rows: [listing], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes("UPDATE market_listings SET status = 'sold'")) {
    const buyerId = params[0];
    const soldAt = params[1];
    const listingId = params[params.length - 1];
    const listing = mockDB.market_listings.find(l => Number(l.id) === Number(listingId));
    if (listing) {
      listing.status = 'sold';
      listing.buyer_id = Number(buyerId);
      listing.sold_at = soldAt;
      saveMockData();
      return { rows: [listing], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 19. Market Deals History Queries
  if (sql.includes('INSERT INTO market_deals_history')) {
    const [listingId, cardId, sellerId, buyerId, price, feeCoins, netPayout] = params;
    const deal = {
      id: mockDB.market_deals_history.length + 1,
      listing_id: Number(listingId),
      card_id: Number(cardId),
      seller_id: Number(sellerId),
      buyer_id: Number(buyerId),
      price: Number(price),
      fee_coins: Number(feeCoins),
      net_payout: Number(netPayout),
      created_at: new Date().toISOString()
    };
    mockDB.market_deals_history.unshift(deal);
    saveMockData();
    return { rows: [deal], rowCount: 1 };
  }

  if (sql.includes('FROM market_deals_history')) {
    let deals = mockDB.market_deals_history;
    if (sql.includes('listing_id =')) {
      const lId = params[0];
      deals = deals.filter(d => Number(d.listing_id) === Number(lId));
    } else if (sql.includes('card_id =')) {
      const cId = params[0];
      deals = deals.filter(d => Number(d.card_id) === Number(cId));
    }
    const enrichedDeals = deals.map(deal => {
      const card = mockDB.cards.find(c => Number(c.id) === Number(deal.card_id));
      const seller = mockDB.users.find(u => Number(u.id) === Number(deal.seller_id));
      const buyer = mockDB.users.find(u => Number(u.id) === Number(deal.buyer_id));
      return {
        ...deal,
        card_bank: card?.bank || '',
        card_material: card?.material || '',
        card_category: card?.category || '',
        card_serial: card?.serial_number || `CD-${String(card?.id).padStart(6, '0')}`,
        seller_username: seller?.username || 'user',
        seller_prefix: seller?.prefix || null,
        buyer_username: buyer?.username || 'user',
        buyer_prefix: buyer?.prefix || null
      };
    });
    enrichedDeals.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return { rows: enrichedDeals.slice(0, 50), rowCount: enrichedDeals.length };
  }

  // 20. Promo Codes Queries
  if (sql.includes('FROM promo_codes WHERE') && (sql.includes('UPPER(code) =') || sql.includes('code ='))) {
    let rawCode = String(params[0] || '').trim().toUpperCase();
    if (!rawCode) {
      const match = sql.match(/code\s*=\s*'([^']+)'/i);
      if (match) rawCode = match[1].trim().toUpperCase();
    }
    const promo = mockDB.promo_codes.find(p => p.code.trim().toUpperCase() === rawCode && p.is_active);
    return { rows: promo ? [promo] : [], rowCount: promo ? 1 : 0 };
  }

  if (sql.includes('FROM promo_codes')) {
    return { rows: mockDB.promo_codes, rowCount: mockDB.promo_codes.length };
  }

  if (sql.includes('INSERT INTO promo_codes')) {
    const [code, rewardType, rewardValue, maxUses, expiresAt, isActive] = params;
    const promo = {
      id: mockDB.promo_codes.length + 1,
      code: String(code).trim().toUpperCase(),
      reward_type: String(rewardType),
      reward_value: String(rewardValue),
      max_uses: Number(maxUses || 0),
      uses_count: 0,
      expires_at: expiresAt || null,
      is_active: isActive !== undefined ? Boolean(isActive) : true,
      created_at: new Date().toISOString()
    };
    mockDB.promo_codes.unshift(promo);
    saveMockData();
    return { rows: [promo], rowCount: 1 };
  }

  if (sql.includes('UPDATE promo_codes SET uses_count = uses_count + 1')) {
    const promoId = params[0];
    const promo = mockDB.promo_codes.find(p => Number(p.id) === Number(promoId));
    if (promo) {
      promo.uses_count = (promo.uses_count || 0) + 1;
      saveMockData();
      return { rows: [promo], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('UPDATE promo_codes SET is_active =')) {
    const isActive = Boolean(params[0]);
    const promoId = params[1];
    const promo = mockDB.promo_codes.find(p => Number(p.id) === Number(promoId));
    if (promo) {
      promo.is_active = isActive;
      saveMockData();
      return { rows: [promo], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  if (sql.includes('DELETE FROM promo_codes WHERE id =')) {
    const promoId = params[0];
    const idx = mockDB.promo_codes.findIndex(p => Number(p.id) === Number(promoId));
    if (idx !== -1) {
      const removed = mockDB.promo_codes.splice(idx, 1);
      saveMockData();
      return { rows: removed, rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }

  // 21. User Promo Activations Queries
  if (sql.includes('FROM user_promo_activations WHERE user_id =') && sql.includes('promo_id =')) {
    const [userId, promoId] = params;
    const act = mockDB.user_promo_activations.find(a => Number(a.user_id) === Number(userId) && Number(a.promo_id) === Number(promoId));
    return { rows: act ? [act] : [], rowCount: act ? 1 : 0 };
  }

  if (sql.includes('INSERT INTO user_promo_activations')) {
    const [userId, promoId, code, rewardType, rewardValue] = params;
    const act = {
      id: mockDB.user_promo_activations.length + 1,
      user_id: Number(userId),
      promo_id: Number(promoId),
      code: String(code),
      reward_type: String(rewardType),
      reward_value: String(rewardValue),
      created_at: new Date().toISOString()
    };
    mockDB.user_promo_activations.push(act);
    saveMockData();
    return { rows: [act], rowCount: 1 };
  }

  // Fallback generic empty
  return { rows: [], rowCount: 0 };
}
