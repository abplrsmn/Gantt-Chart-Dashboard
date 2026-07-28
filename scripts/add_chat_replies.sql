-- Threaded replies: a message can quote an earlier one in the same conversation.
-- ON DELETE SET NULL so hard-deleting an original doesn't cascade away the reply.
-- Idempotent.  Run:  psql -d <your_db> -f scripts/add_chat_replies.sql

alter table chat_messages add column if not exists reply_to bigint
  references chat_messages(id) on delete set null;

create index if not exists idx_chat_messages_reply_to on chat_messages (reply_to);
