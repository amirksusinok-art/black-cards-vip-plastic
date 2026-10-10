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

// Mock Store for dev / testing when PostgreSQL server is not locally running
interface MockDB {
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
}

const mockDbPath = path.resolve(process.cwd(), 'data_local_store.json');

function loadMockData(): MockDB {
  try {
    if (fs.existsSync(mockDbPath)) {
      return JSON.parse(fs.readFileSync(mockDbPath, 'utf8'));
    }
  } catch (err) {
    console.warn('Failed to load local mock DB, resetting:', err);
  }

  return {
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
      { id: 3, task_key: 'daily_mission', title: 'Задание дня', reward_coins: 300, target_count: 1, task_type: 'mission' }
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
    user_settings: []
  };
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

      // Run migration
      const migrationFile = path.resolve(__dirname, '../migrations/001_initial_schema.sql');
      if (fs.existsSync(migrationFile)) {
        const sql = fs.readFileSync(migrationFile, 'utf8');
        await pool.query(sql);
        console.log('Database migrations applied successfully.');
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

  if (sql.includes('INSERT INTO users')) {
    const tgId = params[0];
    const username = params[1];
    let customCoins = 1500;
    // Check if coins parameter was provided
    if (params.length >= 3 && typeof params[2] === 'number') {
      customCoins = params[2];
    }
    const firstName = typeof params[2] === 'string' ? params[2] : 'Player';
    const lastName = params[3] || '';
    const photoUrl = params[4] || '';
    
    let user = mockDB.users.find(u => Number(u.telegram_id) === Number(tgId));
    if (!user) {
      user = {
        id: mockDB.users.length + 1,
        telegram_id: Number(tgId),
        username: username || 'user',
        first_name: firstName,
        last_name: lastName,
        photo_url: photoUrl,
        coins: customCoins,
        level: 1,
        exp: 0,
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

  if (sql.includes('UPDATE users SET coins = coins -')) {
    const amountMatch = sql.match(/coins\s*-\s*(\d+)/i);
    const amount = amountMatch ? parseInt(amountMatch[1], 10) : 500;
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
    const [cardUid, userId, bank, material, category, cardNumber, code, expiresAt, score, isFree] = params;
    const card = {
      id: mockDB.cards.length + 1,
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
      created_at: new Date().toISOString()
    };
    mockDB.cards.push(card);
    saveMockData();
    return { rows: [card], rowCount: 1 };
  }

  if (sql.includes('FROM cards WHERE user_id =') && sql.includes('ORDER BY created_at DESC')) {
    const userId = params[0];
    let userCards = mockDB.cards.filter(c => c.user_id === Number(userId));
    
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

  if (sql.includes('FROM cards WHERE id =') || sql.includes('FROM cards WHERE card_uid =')) {
    const idOrUid = params[0];
    const card = mockDB.cards.find(c => c.id === Number(idOrUid) || c.card_uid === idOrUid);
    return { rows: card ? [card] : [], rowCount: card ? 1 : 0 };
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
    const userTasks = mockDB.user_tasks.filter(t => t.user_id === Number(userId));
    return { rows: userTasks, rowCount: userTasks.length };
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

  // Fallback generic empty
  return { rows: [], rowCount: 0 };
}
