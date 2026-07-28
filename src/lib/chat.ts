import type { PoolClient } from "pg";

/** Returns true when `accId` belongs to the conversation. */
export async function isMember(
  client: PoolClient,
  conversationId: string | number,
  accId: string | number
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM chat_conversation_members WHERE conversation_id = $1 AND acc_id = $2 LIMIT 1`,
    [conversationId, accId]
  );
  return rows.length > 0;
}

/** Finds an existing 1:1 conversation between two accounts, or creates one. */
export async function getOrCreateDm(
  client: PoolClient,
  a: string | number,
  b: string | number
): Promise<string> {
  const existing = await client.query(
    `SELECT c.id
       FROM chat_conversations c
      WHERE c.kind = 'dm'
        AND (SELECT count(*) FROM chat_conversation_members m WHERE m.conversation_id = c.id) = 2
        AND EXISTS (SELECT 1 FROM chat_conversation_members m WHERE m.conversation_id = c.id AND m.acc_id = $1)
        AND EXISTS (SELECT 1 FROM chat_conversation_members m WHERE m.conversation_id = c.id AND m.acc_id = $2)
      LIMIT 1`,
    [a, b]
  );
  if (existing.rows[0]) return String(existing.rows[0].id);

  const created = await client.query(
    `INSERT INTO chat_conversations (kind, name, created_by) VALUES ('dm', NULL, $1) RETURNING id`,
    [a]
  );
  const id = created.rows[0].id;
  await client.query(
    `INSERT INTO chat_conversation_members (conversation_id, acc_id)
     VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`,
    [id, a, b]
  );
  return String(id);
}

/**
 * Shared message SELECT: full column set plus a resolved preview (sender,
 * body, attachment name/mime) of whichever message this one replies to.
 * Single source of truth so the messages, attachments, and forward paths
 * can't drift out of sync on which columns they return.
 */
export const MESSAGE_SELECT = `
  SELECT m.id, m.room, m.conversation_id, m.acc_id, m.sender_name, m.role, m.body,
         m.created_at, m.edited_at, m.deleted_at, m.pinned_at, m.pinned_by,
         m.is_forwarded, m.forwarded_from, m.reply_to,
         m.attachment_url, m.attachment_name, m.attachment_mime, m.attachment_size,
         r.sender_name AS reply_sender,
         CASE WHEN r.deleted_at IS NOT NULL THEN NULL ELSE r.body END AS reply_body,
         CASE WHEN r.deleted_at IS NOT NULL THEN NULL ELSE r.attachment_name END AS reply_attachment_name,
         CASE WHEN r.deleted_at IS NOT NULL THEN NULL ELSE r.attachment_mime END AS reply_attachment_mime
    FROM chat_messages m
    LEFT JOIN chat_messages r ON r.id = m.reply_to
`;

/** SQL fragment producing the member list for a conversation as JSON. */
export const MEMBERS_JSON = `
  (SELECT COALESCE(json_agg(json_build_object(
            'accId', m.acc_id,
            'name',  COALESCE(p.full_name, a.email),
            'department', p.department
          ) ORDER BY COALESCE(p.full_name, a.email)), '[]'::json)
     FROM chat_conversation_members m
     JOIN master_acc a ON a.id = m.acc_id
     LEFT JOIN master_people p ON p.id = a.person_id
    WHERE m.conversation_id = c.id)
`;
