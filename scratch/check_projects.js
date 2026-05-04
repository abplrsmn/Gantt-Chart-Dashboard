const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });
async function main() {
  const c = await pool.connect();
  try {
    const cols = await c.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='projects' ORDER BY ordinal_position"
    );
    console.log('projects columns:');
    console.table(cols.rows);
    const cnt = await c.query('SELECT COUNT(*) FROM projects');
    console.log('Row count:', cnt.rows[0].count);
    // Also show first 3 rows
    const sample = await c.query('SELECT * FROM projects LIMIT 3');
    console.log('\nSample rows:');
    console.table(sample.rows);
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
