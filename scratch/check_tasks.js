const { Pool } = require('pg');
const pool = new Pool({ host: '202.83.121.156', port: 5433, user: 'cici', password: 'clickup123', database: 'cici', ssl: false });

async function run() {
  const c = await pool.connect();

  // project_tasks columns
  const tc = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='project_tasks' ORDER BY ordinal_position`);
  console.log('=== project_tasks columns ===');
  console.log(tc.rows.map(x => `${x.column_name} (${x.data_type})`).join('\n'));

  // project_task_progress_periods columns
  const pc = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='project_task_progress_periods' ORDER BY ordinal_position`);
  console.log('\n=== project_task_progress_periods columns ===');
  console.log(pc.rows.map(x => `${x.column_name} (${x.data_type})`).join('\n'));

  // Sample data
  const ts = await c.query(`SELECT * FROM project_tasks LIMIT 3`);
  console.log('\n=== project_tasks sample ===');
  console.log(JSON.stringify(ts.rows, null, 2));

  const ps = await c.query(`SELECT * FROM project_task_progress_periods LIMIT 5`);
  console.log('\n=== project_task_progress_periods sample ===');
  console.log(JSON.stringify(ps.rows, null, 2));

  // Count
  const cnt1 = await c.query(`SELECT COUNT(*) FROM project_tasks`);
  const cnt2 = await c.query(`SELECT COUNT(*) FROM project_task_progress_periods`);
  console.log(`\nproject_tasks: ${cnt1.rows[0].count} rows`);
  console.log(`project_task_progress_periods: ${cnt2.rows[0].count} rows`);

  c.release();
  await pool.end();
}
run().catch(console.error);
