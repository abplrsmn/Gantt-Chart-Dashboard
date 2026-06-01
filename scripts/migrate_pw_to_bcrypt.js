/**
 * One-time migration: hash all plaintext passwords in master_acc.
 *
 * Run ONCE after deploying the bcrypt auth update:
 *   node scripts/migrate_pw_to_bcrypt.js
 *
 * What it does:
 *   1. Adds password_hash column (if missing)
 *   2. Reads every row that still has password_plain set
 *   3. Hashes each password with bcrypt (cost=12)
 *   4. Writes the hash to password_hash
 *   5. Clears password_plain (sets to NULL) after each successful hash
 *   6. Drops password_plain column when all rows are migrated
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' }); // fallback
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 12;

async function main() {
  const pool = new Pool({
    host:     process.env.PGHOST,
    port:     Number(process.env.PGPORT) || 5432,
    user:     process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
  });

  const client = await pool.connect();
  try {
    // 1. Add password_hash column if it doesn't exist yet
    await client.query(`
      ALTER TABLE master_acc
      ADD COLUMN IF NOT EXISTS password_hash varchar(255)
    `);
    console.log('✓ password_hash column ready');

    // 2. Fetch rows that still have plaintext
    const { rows } = await client.query(`
      SELECT id, password_plain
      FROM master_acc
      WHERE password_plain IS NOT NULL AND password_plain <> ''
    `);

    if (rows.length === 0) {
      console.log('No plaintext passwords left — already migrated or no accounts.');
    } else {
      console.log(`Migrating ${rows.length} account(s)...`);
      for (const row of rows) {
        const hash = await bcrypt.hash(row.password_plain, SALT_ROUNDS);
        await client.query(
          `UPDATE master_acc SET password_hash = $1, password_plain = NULL WHERE id = $2`,
          [hash, row.id]
        );
        console.log(`  ✓ account id=${row.id} hashed`);
      }
    }

    // 3. Verify no plaintext remains before dropping column
    const { rows: remaining } = await client.query(`
      SELECT COUNT(*) AS n FROM master_acc
      WHERE password_plain IS NOT NULL AND password_plain <> ''
    `);

    if (Number(remaining[0].n) === 0) {
      await client.query(`ALTER TABLE master_acc DROP COLUMN IF EXISTS password_plain`);
      console.log('✓ password_plain column dropped');
    } else {
      console.warn(`⚠ ${remaining[0].n} row(s) still have password_plain — column not dropped yet. Re-run to finish.`);
    }

    console.log('\nMigration complete. Auth now uses bcrypt.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
