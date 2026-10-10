-- 005_leaderboard_admin_settings.sql
-- Settings extensions, Admin Audit Log, and Leaderboard Position History

-- 1. Extend user_settings with compact_mode, notifications, and onboarding
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS compact_mode BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Admin Audit Log table
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id SERIAL PRIMARY KEY,
    admin_telegram_id BIGINT NOT NULL,
    action VARCHAR(64) NOT NULL,
    target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_user_id);

-- 3. Leaderboard Position History for change indicators (↑, ↓, —, Новый)
CREATE TABLE IF NOT EXISTS leaderboard_history (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(32) NOT NULL,
    last_position INTEGER NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_history_cat ON leaderboard_history(category);
