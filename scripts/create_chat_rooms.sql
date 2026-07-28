-- Upgrades the flat chat_messages feed into WhatsApp-style conversations:
-- direct messages + named groups, with editable / deletable / pinnable messages.
-- Idempotent. Run:  psql -d <your_db> -f scripts/create_chat_rooms.sql

create table if not exists chat_conversations (
  id         bigserial primary key,
  kind       varchar(10)  not null default 'group',  -- 'dm' | 'group'
  name       varchar(200) null,                      -- group title; null for DMs
  created_by bigint       null references master_acc(id) on delete set null,
  created_at timestamptz  not null default now()
);

create table if not exists chat_conversation_members (
  conversation_id bigint      not null references chat_conversations(id) on delete cascade,
  acc_id          bigint      not null references master_acc(id)         on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, acc_id)
);

-- Message-level features. `room` is kept for the private AI thread ('ai');
-- everything with a conversation_id belongs to the team chat side.
alter table chat_messages add column if not exists conversation_id bigint
  references chat_conversations(id) on delete cascade;
alter table chat_messages add column if not exists edited_at  timestamptz;
alter table chat_messages add column if not exists deleted_at timestamptz;
alter table chat_messages add column if not exists pinned_at  timestamptz;
alter table chat_messages add column if not exists pinned_by  varchar(255);

create index if not exists idx_chat_messages_conversation on chat_messages (conversation_id, id);
create index if not exists idx_chat_members_acc           on chat_conversation_members (acc_id);
