-- Adds optional single-attachment support to chat messages (image or file).
-- Idempotent. Run:  psql -d <your_db> -f scripts/add_chat_attachments.sql

alter table chat_messages add column if not exists attachment_url  text;
alter table chat_messages add column if not exists attachment_name varchar(255);
alter table chat_messages add column if not exists attachment_mime varchar(100);
alter table chat_messages add column if not exists attachment_size bigint;
