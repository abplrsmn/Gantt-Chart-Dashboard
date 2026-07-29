-- Configurable detail fields for each project phase.
-- Run with: psql -d <database> -f scripts/create_phase_detail_fields.sql

create table if not exists master_phase_detail_fields (
  id bigserial primary key,
  phase_id bigint not null references master_phases(id) on delete cascade,
  field_key varchar(80) not null,
  field_label varchar(120) not null,
  field_type varchar(20) not null default 'text'
    check (field_type in ('text', 'textarea', 'date', 'number', 'currency', 'percentage')),
  field_order integer not null default 0,
  is_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phase_id, field_key)
);

create table if not exists project_phase_detail_values (
  project_id bigint not null references projects(id) on delete cascade,
  field_id bigint not null references master_phase_detail_fields(id) on delete cascade,
  value text null,
  updated_at timestamptz not null default now(),
  primary key (project_id, field_id)
);

create index if not exists idx_phase_detail_fields_phase_order
  on master_phase_detail_fields(phase_id, field_order, id);
create index if not exists idx_project_phase_detail_values_project
  on project_phase_detail_values(project_id);
