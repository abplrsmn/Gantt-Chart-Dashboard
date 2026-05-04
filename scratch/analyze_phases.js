const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

async function main() {
  const c = await pool.connect();
  try {
    console.log('=== master_phases ===');
    const mp = await c.query('SELECT * FROM master_phases ORDER BY id');
    console.table(mp.rows);

    console.log('\n=== project_phases columns ===');
    const cols = await c.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'project_phases'
      ORDER BY ordinal_position
    `);
    console.table(cols.rows);

    console.log('\n=== project_phases sample data ===');
    const sample = await c.query('SELECT * FROM project_phases LIMIT 5');
    console.table(sample.rows);

    console.log('\n=== project_phases row count ===');
    const cnt = await c.query('SELECT COUNT(*) FROM project_phases');
    console.log('Total rows:', cnt.rows[0].count);

  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
