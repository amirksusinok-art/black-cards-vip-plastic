-- 003_serial_numbers.sql
-- Add serial_number column for unique instance identifiers (e.g. CD-008421)

ALTER TABLE cards ADD COLUMN IF NOT EXISTS serial_number VARCHAR(32);
CREATE INDEX IF NOT EXISTS idx_cards_serial_number ON cards(serial_number);
