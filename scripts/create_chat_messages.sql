-- Chat room storage: shared team channel + private per-user AI assistant threads.
-- Run once:  psql -d <your_db> -f scripts/create_chat_messages.sql

create table if not exists chat_messages (
  id          bigserial primary key,
  room        varchar(20)  not null default 'team',   -- 'team' (shared) | 'ai' (private per acc_id)
  acc_id      bigint       null,                      -- author; null for AI replies
  sender_name varchar(255) not null,
  role        varchar(20)  not null default 'user',   -- 'user' | 'assistant'
  body        text         not null,
  created_at  timestamptz  not null default now(),

  constraint fk_chat_messages_acc
    foreign key (acc_id)
    references master_acc(id)
    on update cascade
    on delete set null
);

-- Team feed is read newest-last per room; AI threads are additionally scoped by acc_id.
create index if not exists idx_chat_messages_room_created on chat_messages (room, created_at);
create index if not exists idx_chat_messages_acc_room     on chat_messages (acc_id, room, created_at);
