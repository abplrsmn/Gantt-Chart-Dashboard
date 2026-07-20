-- The Summary-import "+/-" column (col27) sometimes holds non-numeric raw
-- Excel text ("#VALUE!", "not required", "aborted project"), which the
-- previous integer-only cleaning silently dropped to NULL. The user wants the
-- raw cell value shown as-is, so widen the column to hold text.
-- Run once: psql -d <your_db> -f scripts/widen_deviation_days.sql

ALTER TABLE project_phases ALTER COLUMN deviation_days TYPE varchar(100) USING deviation_days::varchar;
