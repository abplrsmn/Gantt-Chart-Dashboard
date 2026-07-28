-- Generic per-phase dates.
--
-- project_phases is a wide table where each of the 5 built-in phases owns
-- bespoke date columns (received_date, start_design_date, commence_date, …).
-- That leaves a newly-created custom phase with nowhere to store its timeline,
-- so it can never appear in the Gantt / summary / dashboard.
--
-- These two columns give custom phases a generic start/end. The built-in five
-- keep using their own columns, so nothing existing changes.
-- Idempotent. Run:  psql -d <your_db> -f scripts/add_generic_phase_dates.sql

alter table project_phases add column if not exists phase_start_date date;
alter table project_phases add column if not exists phase_end_date   date;
