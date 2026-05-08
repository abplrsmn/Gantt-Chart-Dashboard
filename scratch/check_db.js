const { Pool } = require('pg');
const pool = new Pool({ host: '202.83.121.156', port: 5433, user: 'cici', password: 'clickup123', database: 'cici', ssl: false });

async function run() {
  const c = await pool.connect();

  // All tables
  const tables = await c.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log('=== TABLES ===');
  console.log(tables.rows.map(x => x.table_name).join('\n'));

  // project_phases columns
  const cols = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='project_phases' ORDER BY ordinal_position`);
  console.log('\n=== project_phases columns ===');
  console.log(cols.rows.map(x => `${x.column_name} (${x.data_type})`).join('\n'));

  // Sample project_phases row
  const sample = await c.query(`SELECT * FROM project_phases LIMIT 2`);
  console.log('\n=== project_phases sample ===');
  console.log(JSON.stringify(sample.rows, null, 2));

  c.release();
  await pool.end();
}
run().catch(console.error);
