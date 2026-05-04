const { Pool } = require('pg');

const pool = new Pool({
  host: '202.83.121.156',
  port: 5433,
  user: 'cici',
  password: 'clickup123',
  database: 'cici',
  ssl: false,
});

async function main() {
  const c = await pool.connect();
  try {
    // List all tables
    const tables = await c.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log('\n📋 All tables in DB:');
    console.table(tables.rows);

    // Check specifically for category/priority related tables
    const catTables = await c.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND (
          table_name ILIKE '%categor%'
          OR table_name ILIKE '%priorit%'
        )
      ORDER BY table_name;
    `);
    console.log('\n🔍 Category/Priority tables:');
    if (catTables.rows.length === 0) {
      console.log('  (none found)');
    } else {
      console.table(catTables.rows);
      // Show columns for each found table
      for (const row of catTables.rows) {
        const cols = await c.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [row.table_name]);
        console.log(`\n  Columns of "${row.table_name}":`);
        console.table(cols.rows);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
