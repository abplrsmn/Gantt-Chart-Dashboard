-- Reminder audit table
-- Minimal audit-first design using existing master tables.
-- No recipient-person tracking and no delivery-status field for this phase.

create table if not exists chat_reminder_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  scheduled_for timestamptz null,
  sent_at timestamptz null,

  channel varchar(30) not null,
  target_type varchar(30) not null,

  target_role_id bigint null,
  target_unit_id bigint null,

  reminder_type varchar(50) not null,
  template_key varchar(100) null,
  message_subject varchar(255) null,
  message_body text not null,
  message_payload jsonb null,
  context_payload jsonb null,

  dedupe_key varchar(255) null,
  run_key varchar(255) null,
  trigger_source varchar(50) not null default 'system',
  created_by varchar(100) null,
  is_simulated boolean not null default false,

  constraint fk_chat_reminder_logs_role
    foreign key (target_role_id)
    references master_roles(id)
    on update cascade
    on delete set null,

  constraint fk_chat_reminder_logs_unit
    foreign key (target_unit_id)
    references master_units(id)
    on update cascade
    on delete set null,

  constraint chk_chat_reminder_logs_target_type
    check (target_type in ('role_unit', 'role', 'unit', 'summary_group', 'all')),

  constraint chk_chat_reminder_logs_channel
    check (channel in ('telegram', 'whatsapp', 'discord', 'slack', 'signal', 'imessage', 'line', 'googlechat', 'irc'))
);

create index if not exists idx_chat_reminder_logs_created_at
  on chat_reminder_logs (created_at desc);

create index if not exists idx_chat_reminder_logs_target_role_unit
  on chat_reminder_logs (target_role_id, target_unit_id);

create index if not exists idx_chat_reminder_logs_reminder_type
  on chat_reminder_logs (reminder_type);

create index if not exists idx_chat_reminder_logs_run_key
  on chat_reminder_logs (run_key);

create index if not exists idx_chat_reminder_logs_dedupe_key
  on chat_reminder_logs (dedupe_key);

comment on table chat_reminder_logs is
  'Audit log of generated reminder messages grouped by target role/unit bucket.';

comment on column chat_reminder_logs.target_type is
  'Bucket type for the reminder target: role_unit, role, unit, summary_group, or all.';

comment on column chat_reminder_logs.message_payload is
  'Rendered message payload/body structure before channel send.';

comment on column chat_reminder_logs.context_payload is
  'Business context used to generate the reminder, such as counts, project ids, or summary metrics.';
