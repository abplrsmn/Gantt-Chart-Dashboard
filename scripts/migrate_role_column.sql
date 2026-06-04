-- Add role column to master_acc if not already present, then sync it from is_admin.
-- Run once: psql -d <your_db> -f scripts/migrate_role_column.sql

ALTER TABLE master_acc ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'pm';

-- Sync existing rows: admin flag → 'admin', otherwise 'pm'
UPDATE master_acc SET role = CASE WHEN is_admin THEN 'admin' ELSE 'pm' END;
