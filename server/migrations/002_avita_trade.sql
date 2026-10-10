-- CardDrop / Black Cards & VIP Plastic Migration 002: Avita Trade & Cards Sale Status

-- 1. Add sold status to cards table
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_sold BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sold_price INTEGER DEFAULT NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 2. Add Avita cooldown block timestamp to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS avita_blocked_until TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- 3. Avita Negotiation Sessions (Active bargains)
CREATE TABLE IF NOT EXISTS avita_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_ids JSONB NOT NULL,
    initial_offer INTEGER NOT NULL,
    current_offer INTEGER NOT NULL,
    max_offer INTEGER NOT NULL,
    rounds_used INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- active, accepted, rejected, cancelled
    dialog_history JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_avita_sessions_user ON avita_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_avita_sessions_id ON avita_sessions(session_id);

-- 4. Avita Deals History
CREATE TABLE IF NOT EXISTS avita_deals (
    id SERIAL PRIMARY KEY,
    deal_id VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_count INTEGER NOT NULL DEFAULT 1,
    cards_summary JSONB NOT NULL,
    final_price INTEGER NOT NULL CHECK (final_price > 0),
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_avita_deals_user ON avita_deals(user_id);
