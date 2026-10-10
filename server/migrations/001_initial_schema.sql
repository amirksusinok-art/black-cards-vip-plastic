-- CardDrop / Black Cards & VIP Plastic PostgreSQL Migration 001
-- ANSI SQL compatible

-- 1. Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(255),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    photo_url TEXT,
    coins INTEGER NOT NULL DEFAULT 5000 CHECK (coins >= 0),
    level INTEGER NOT NULL DEFAULT 1,
    exp INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);

-- 2. Card Templates (Visual grouping)
CREATE TABLE IF NOT EXISTS card_templates (
    id SERIAL PRIMARY KEY,
    bank VARCHAR(100) NOT NULL,
    material VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    design_version INTEGER NOT NULL DEFAULT 1,
    template_key VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_card_templates_key ON card_templates(template_key);

-- 3. Cards
CREATE TABLE IF NOT EXISTS cards (
    id SERIAL PRIMARY KEY,
    card_uid VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    bank VARCHAR(100) NOT NULL,
    material VARCHAR(100) NOT NULL,
    category VARCHAR(100) NOT NULL,
    card_number VARCHAR(19) NOT NULL,
    collection_code VARCHAR(4) NOT NULL,
    expires_at VARCHAR(7) NOT NULL,
    collector_score INTEGER NOT NULL DEFAULT 10,
    is_free_roll BOOLEAN NOT NULL DEFAULT FALSE,
    template_id INTEGER REFERENCES card_templates(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cards_user_id ON cards(user_id);
CREATE INDEX IF NOT EXISTS idx_cards_created_at ON cards(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cards_card_uid ON cards(card_uid);

-- 4. User Favorites (max 5)
CREATE TABLE IF NOT EXISTS user_favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, card_id)
);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON user_favorites(user_id);

-- 5. Albums
CREATE TABLE IF NOT EXISTS albums (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    required_count INTEGER NOT NULL DEFAULT 5,
    reward_coins INTEGER NOT NULL DEFAULT 500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. User Albums
CREATE TABLE IF NOT EXISTS user_albums (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    album_id INTEGER NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    progress INTEGER NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(user_id, album_id)
);
CREATE INDEX IF NOT EXISTS idx_user_albums_user ON user_albums(user_id);

-- 7. Daily Tasks
CREATE TABLE IF NOT EXISTS daily_tasks (
    id SERIAL PRIMARY KEY,
    task_key VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(255) NOT NULL,
    reward_coins INTEGER NOT NULL CHECK (reward_coins > 0),
    target_count INTEGER NOT NULL DEFAULT 1,
    task_type VARCHAR(50) NOT NULL
);

-- 8. User Tasks
CREATE TABLE IF NOT EXISTS user_tasks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id INTEGER NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
    current_progress INTEGER NOT NULL DEFAULT 0,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    task_date DATE NOT NULL DEFAULT CURRENT_DATE,
    UNIQUE(user_id, task_id, task_date)
);
CREATE INDEX IF NOT EXISTS idx_user_tasks_user_date ON user_tasks(user_id, task_date);

-- 9. Free Rolls (BOMZH Mode history & rate limits)
CREATE TABLE IF NOT EXISTS free_rolls (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    roll_date DATE NOT NULL DEFAULT CURRENT_DATE,
    daily_count INTEGER NOT NULL DEFAULT 0,
    last_roll_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, roll_date)
);
CREATE INDEX IF NOT EXISTS idx_free_rolls_user_date ON free_rolls(user_id, roll_date);

-- 10. Operations (Idempotency storage)
CREATE TABLE IF NOT EXISTS operations (
    id SERIAL PRIMARY KEY,
    request_id VARCHAR(128) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(64) NOT NULL,
    response_payload JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operations_request_id ON operations(request_id);
CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);

-- 11. Coin Ledger
CREATE TABLE IF NOT EXISTS coin_ledger (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
    reason VARCHAR(255) NOT NULL,
    reference_id VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id, created_at DESC);

-- 12. Cosmetic Items (Telegram Stars Catalog)
CREATE TABLE IF NOT EXISTS cosmetic_items (
    id SERIAL PRIMARY KEY,
    item_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(64) NOT NULL,
    price_stars INTEGER NOT NULL CHECK (price_stars > 0),
    description TEXT,
    preview_meta JSONB
);

-- 13. User Cosmetics
CREATE TABLE IF NOT EXISTS user_cosmetics (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES cosmetic_items(id) ON DELETE CASCADE,
    is_equipped BOOLEAN NOT NULL DEFAULT FALSE,
    acquired_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_cosmetics_user ON user_cosmetics(user_id);

-- 14. Star Payments
CREATE TABLE IF NOT EXISTS star_payments (
    id SERIAL PRIMARY KEY,
    payment_charge_id VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES cosmetic_items(id),
    stars_amount INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    telegram_payment_charge_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_star_payments_charge ON star_payments(payment_charge_id);

-- 15. User Settings
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    haptics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reduce_motion BOOLEAN NOT NULL DEFAULT FALSE,
    card_of_the_day_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initial Seeds
INSERT INTO cosmetic_items (item_key, name, type, price_stars, description, preview_meta)
VALUES
    ('holder_classic', 'Холдер карты', 'holder', 5, 'Премиальный матовый холдер для презентации вашей карты', '{"color": "#1C1E24", "border": "#3B4252"}'),
    ('frame_vip', 'Рамка профиля', 'frame', 10, 'Эксклюзивная золотая окантовка аватара профиля', '{"border": "#D4AF37", "glow": "rgba(212,175,55,0.4)"}'),
    ('effect_digits_matrix', 'Эффект цифр', 'digit_fx', 10, 'Кибернетическое неоновое мерцание цифр при выпадении', '{"glowColor": "#00FFCC", "font": "Space Mono"}'),
    ('bg_luxury_onyx', 'Фон профиля', 'profile_bg', 15, 'Глубокий текстурированный оникс с карбоновым тиснением', '{"gradient": "linear-gradient(180deg, #0D0E12 0%, #171A21 100%)"}'),
    ('bundle_black_vip', 'Комплект оформления', 'bundle', 25, 'Полный набор: Холдер, Золотая Рамка, Эффект Цифр и Фон Оникс', '{"includes": ["holder_classic", "frame_vip", "effect_digits_matrix", "bg_luxury_onyx"]}')
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO daily_tasks (task_key, title, reward_coins, target_count, task_type)
VALUES
    ('daily_login', 'Войти в игру', 50, 1, 'login'),
    ('roll_3_cards', 'Выпустить три карты', 150, 3, 'rolls'),
    ('daily_mission', 'Задание дня', 300, 1, 'mission')
ON CONFLICT (task_key) DO NOTHING;

INSERT INTO albums (name, description, category, required_count, reward_coins)
VALUES
    ('Банковский Альянс', 'Соберите карты всех 5 банков', 'banks', 5, 500),
    ('Материалы Будущего', 'Соберите все 6 видов материалов', 'materials', 6, 1000),
    ('Клуб Счастливчиков', 'Соберите 3 редких номерных узора (Triple, Quad или Mirror)', 'rarities', 3, 1500)
ON CONFLICT DO NOTHING;
