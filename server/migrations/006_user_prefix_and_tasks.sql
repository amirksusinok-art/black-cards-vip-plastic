-- 006_user_prefix_and_tasks.sql
-- User prefixes set by admin and clicker claimed tasks tracking

ALTER TABLE users ADD COLUMN IF NOT EXISTS prefix VARCHAR(32) DEFAULT NULL;
ALTER TABLE user_clicker ADD COLUMN IF NOT EXISTS claimed_tasks JSONB DEFAULT '[]'::jsonb;
