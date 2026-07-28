/**
 * Seeds demo teammates + the default "General" group for the chat room.
 *
 * Idempotent: re-running will not duplicate people, accounts, or memberships.
 * Usage:  node scripts/seed_chat_demo.mjs
 */
import "dotenv/config";
import fs from "node:fs";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const DEMO_PASSWORD = "user123";

const DEMO_PEOPLE = [
  { code: "EMP-D01", name: "Rina Wijaya",   nick: "Rina",  dept: "Design",          title: "Interior Designer",     email: "rina.wijaya@user.com" },
  { code: "EMP-D02", name: "Budi Santoso",  nick: "Budi",  dept: "Project Control", title: "Cost Controller",       email: "budi.santoso@user.com" },
  { code: "EMP-D03", name: "Sari Dewi",     nick: "Sari",  dept: "PM",              title: "Project Manager",       email: "sari.dewi@user.com" },
  { code: "EMP-D04", name: "Andi Pratama",  nick: "Andi",  dept: "IT",              title: "Systems Analyst",       email: "andi.pratama@user.com" },
  { code: "EMP-D05", name: "Maya Kusuma",   nick: "Maya",  dept: "Finance",         title: "Finance Officer",       email: "maya.kusuma@user.com" },
];

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

const client = await pool.connect();
try {
  await client.query("BEGIN");

  // 1. Schema
  await client.query(fs.readFileSync("scripts/create_chat_rooms.sql", "utf8"));

  // 2. Demo people + accounts
  const hash = await bcrypt.hash(DEMO_PASSWORD, 12);
  let created = 0;
  for (const p of DEMO_PEOPLE) {
    const person = await client.query(
      `INSERT INTO master_people (employee_code, full_name, nickname, department, job_title, email, is_active)
       SELECT $1::text, $2::text, $3::text, $4::text, $5::text, $6::text, true
        WHERE NOT EXISTS (SELECT 1 FROM master_people WHERE lower(email) = lower($6::text))
       RETURNING id`,
      [p.code, p.name, p.nick, p.dept, p.title, p.email]
    );
    const personId =
      person.rows[0]?.id ??
      (await client.query(`SELECT id FROM master_people WHERE lower(email) = lower($1)`, [p.email])).rows[0]?.id;

    const acc = await client.query(
      `INSERT INTO master_acc (person_id, email, password_hash, is_active)
       SELECT $1::bigint, $2::text, $3::text, true
        WHERE NOT EXISTS (SELECT 1 FROM master_acc WHERE lower(email) = lower($2::text))
       RETURNING id`,
      [personId, p.email, hash]
    );
    if (acc.rows[0]) created++;
  }

  // 3. Default "General" group containing every active account
  let general = (
    await client.query(`SELECT id FROM chat_conversations WHERE kind = 'group' AND name = 'General' LIMIT 1`)
  ).rows[0];

  if (!general) {
    general = (
      await client.query(
        `INSERT INTO chat_conversations (kind, name, created_by)
         VALUES ('group', 'General', (SELECT id FROM master_acc ORDER BY id LIMIT 1))
         RETURNING id`
      )
    ).rows[0];
  }

  await client.query(
    `INSERT INTO chat_conversation_members (conversation_id, acc_id)
     SELECT $1, a.id FROM master_acc a WHERE a.is_active = true
     ON CONFLICT DO NOTHING`,
    [general.id]
  );

  // 4. Adopt any pre-existing flat 'team' messages into General
  const adopted = await client.query(
    `UPDATE chat_messages SET conversation_id = $1
      WHERE room = 'team' AND conversation_id IS NULL`,
    [general.id]
  );

  await client.query("COMMIT");

  const totals = await client.query(
    `SELECT (SELECT count(*) FROM master_acc WHERE is_active) AS accounts,
            (SELECT count(*) FROM chat_conversation_members WHERE conversation_id = $1) AS general_members`,
    [general.id]
  );

  console.log(`Demo accounts created this run: ${created} (password for all demo users: ${DEMO_PASSWORD})`);
  console.log(`Legacy team messages adopted into General: ${adopted.rowCount}`);
  console.table(totals.rows);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("FAILED, rolled back:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
