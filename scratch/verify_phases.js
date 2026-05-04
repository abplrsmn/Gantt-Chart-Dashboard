const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

async function main() {
  const c = await pool.connect();
  try {
    // Count
    const cnt = await c.query('SELECT COUNT(*) FROM project_phases');
    console.log('Total rows in project_phases:', cnt.rows[0].count);

    // Check constraints / unique indexes
    const constraints = await c.query(`
      SELECT conname, contype, pg_get_constraintdef(oid)
      FROM pg_constraint
      WHERE conrelid = 'project_phases'::regclass
      ORDER BY contype
    `);
    console.log('\nConstraints on project_phases:');
    console.table(constraints.rows);

    // Sample joined data
    const sample = await c.query(`
      SELECT pp.id, p.project_code, mp.phase_name, pp.progress_pct,
             pp.normalized_deadline_date, pp.commence_date, pp.bast_1_date
      FROM project_phases pp
      JOIN projects p ON pp.project_id = p.id
      JOIN master_phases mp ON pp.phase_id = mp.id
      ORDER BY p.id, mp.id
      LIMIT 15
    `);
    console.log('\nSample joined data:');
    console.table(sample.rows);

  } finally {
    c.release();
    await pool.end();
  }
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
