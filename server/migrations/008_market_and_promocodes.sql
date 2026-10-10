-- Migration 008: P2P Marketplace, Promo Codes, and 5000 Coins Default Budget

-- 1. Update default coins to 5000 for users
ALTER TABLE users ALTER COLUMN coins SET DEFAULT 5000;
UPDATE users SET coins = 5000 WHERE coins = 1500;

-- 2. Add is_listed_on_market flag to cards
ALTER TABLE cards ADD COLUMN IF NOT EXISTS is_listed_on_market BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_cards_is_listed ON cards(is_listed_on_market);

-- 3. Market Listings
CREATE TABLE IF NOT EXISTS market_listings (
    id SERIAL PRIMARY KEY,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    price INTEGER NOT NULL CHECK (price > 0),
    fee_percent NUMERIC NOT NULL DEFAULT 3.0,
    status VARCHAR(32) NOT NULL DEFAULT 'active', -- 'active', 'sold', 'cancelled', 'expired'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    sold_at TIMESTAMP WITH TIME ZONE,
    buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller ON market_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_card ON market_listings(card_id);
CREATE INDEX IF NOT EXISTS idx_market_listings_expires ON market_listings(expires_at);

-- 4. Market Deals History (Completed sales between players)
CREATE TABLE IF NOT EXISTS market_deals_history (
    id SERIAL PRIMARY KEY,
    listing_id INTEGER REFERENCES market_listings(id) ON DELETE SET NULL,
    card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    buyer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price INTEGER NOT NULL CHECK (price > 0),
    fee_coins INTEGER NOT NULL DEFAULT 0,
    net_payout INTEGER NOT NULL CHECK (net_payout > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_deals_card ON market_deals_history(card_id);
CREATE INDEX IF NOT EXISTS idx_market_deals_created ON market_deals_history(created_at);

-- 5. Promo Codes
CREATE TABLE IF NOT EXISTS promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(64) UNIQUE NOT NULL,
    reward_type VARCHAR(32) NOT NULL, -- 'coins', 'cosmetic', 'card'
    reward_value VARCHAR(128) NOT NULL,
    max_uses INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
    uses_count INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);

-- 6. User Promo Activations (One activation per code per user)
CREATE TABLE IF NOT EXISTS user_promo_activations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    promo_id INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    code VARCHAR(64) NOT NULL,
    reward_type VARCHAR(32) NOT NULL,
    reward_value VARCHAR(128) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_promo UNIQUE (user_id, promo_id)
);

CREATE INDEX IF NOT EXISTS idx_user_promo_user ON user_promo_activations(user_id);

-- Pre-seed default promo codes
INSERT INTO promo_codes (code, reward_type, reward_value, max_uses, is_active)
VALUES 
    ('START5000', 'coins', '5000', 0, true),
    ('VIPCARD', 'coins', '10000', 0, true),
    ('DROPMARKET', 'coins', '3000', 0, true),
    ('ONYX', 'cosmetic', 'bg_luxury_onyx', 0, true)
ON CONFLICT (code) DO NOTHING;
