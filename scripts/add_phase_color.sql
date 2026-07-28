-- Per-phase color, editable from Master Setup.
--
-- Phase colors used to live in two places: hardcoded hexes in src/lib/phases.ts
-- for the built-in five, and a hash-of-the-code fallback for custom phases.
-- This makes the database the single source of truth so the picker can change
-- them. Seeded with the existing values, so nothing shifts visually until edited.
-- Idempotent. Run:  psql -d <your_db> -f scripts/add_phase_color.sql

alter table master_phases add column if not exists color varchar(9);

update master_phases set color = '#64748b' where phase_code = 'operational_brief'  and color is null;
update master_phases set color = '#3b82f6' where phase_code = 'design'             and color is null;
update master_phases set color = '#f59e0b' where phase_code = 'project_control'    and color is null;
update master_phases set color = '#14b8a6' where phase_code = 'project_management' and color is null;
update master_phases set color = '#22c55e' where phase_code = 'handover'           and color is null;

-- Any custom phase created before this migration gets a neutral default.
update master_phases set color = '#8b5cf6' where color is null;
