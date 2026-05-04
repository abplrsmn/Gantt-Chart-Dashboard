const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });
async function main() {
  const c = await pool.connect();
  try {
    const res = await c.query("SELECT * FROM master_statuses LIMIT 1");
    console.log('Sample row from master_statuses:');
    console.table(res.rows);
  } finally { c.release(); await pool.end(); }
}
main().catch(e => { console.error(e.message); process.exit(1); });
