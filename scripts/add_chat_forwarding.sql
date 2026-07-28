-- Adds forwarding metadata so a forwarded message can be labelled like WhatsApp's
-- "Forwarded" tag and traced back to its origin. Idempotent.
-- Run:  psql -d <your_db> -f scripts/add_chat_forwarding.sql

alter table chat_messages add column if not exists is_forwarded boolean not null default false;
alter table chat_messages add column if not exists forwarded_from bigint;
