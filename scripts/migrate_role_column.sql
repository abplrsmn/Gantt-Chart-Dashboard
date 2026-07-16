-- PM and Admin now have identical permissions/visibility, so the role
-- distinction on master_acc is removed. Run once on existing databases:
-- psql -d <your_db> -f scripts/migrate_role_column.sql

ALTER TABLE master_acc DROP COLUMN IF EXISTS role;
ALTER TABLE master_acc DROP COLUMN IF EXISTS is_admin;
