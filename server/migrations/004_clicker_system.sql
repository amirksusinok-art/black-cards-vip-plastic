-- 004_clicker_system.sql
-- Table for Clicker / Earn Coins feature

CREATE TABLE IF NOT EXISTS user_clicker (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    power_level INTEGER NOT NULL DEFAULT 1,
    recharge_level INTEGER NOT NULL DEFAULT 1,
    current_energy INTEGER NOT NULL DEFAULT 100,
    last_energy_updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_daily_help_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    total_clicks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_clicker_user_id ON user_clicker(user_id);
