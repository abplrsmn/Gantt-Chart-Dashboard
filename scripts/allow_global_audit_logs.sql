-- Audit logging is being extended to cover actions that aren't tied to any
-- single project (user account management, master data). project_change_logs
-- required project_id NOT NULL, which made that impossible.
-- Run once: psql -d <your_db> -f scripts/allow_global_audit_logs.sql

ALTER TABLE project_change_logs ALTER COLUMN project_id DROP NOT NULL;
