const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

pool.connect().then(async c => {
  try {
    // 1. Update projects table (start_date, end_date)
    const r1 = await c.query(`
      UPDATE projects SET
        start_date  = CASE WHEN start_date  IS NOT NULL THEN (start_date  + INTERVAL '1 year')::date ELSE NULL END,
        end_date    = CASE WHEN end_date    IS NOT NULL THEN (end_date    + INTERVAL '1 year')::date ELSE NULL END,
        updated_at  = now()
      WHERE sync_status = 'manual'
    `);
    console.log('projects updated:', r1.rowCount, 'rows');

    // 2. Update project_phases — all date columns
    // First check what date columns exist
    const cols = await c.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'project_phases' AND data_type IN ('date','timestamp with time zone','timestamp without time zone')
      ORDER BY ordinal_position
    `);
    console.log('Date columns in project_phases:', cols.rows.map(r => r.column_name));

    // Build dynamic UPDATE for all date columns
    const dateCols = cols.rows.map(r => r.column_name).filter(c => c !== 'created_at' && c !== 'updated_at');
    if (dateCols.length > 0) {
      const setClauses = dateCols.map(col =>
        `${col} = CASE WHEN ${col} IS NOT NULL THEN (${col} + INTERVAL '1 year')::date ELSE NULL END`
      ).join(',\n        ');

      const r2 = await c.query(`
        UPDATE project_phases SET
          ${setClauses},
          updated_at = now()
        WHERE project_id IN (SELECT id FROM projects WHERE sync_status = 'manual')
      `);
      console.log('project_phases updated:', r2.rowCount, 'rows');
    }

    // 3. Verify
    const check = await c.query(`
      SELECT p.project_code, p.start_date::text, p.end_date::text
      FROM projects p WHERE p.sync_status='manual'
      ORDER BY p.project_code LIMIT 5
    `);
    console.table(check.rows);

  } finally {
    c.release();
    await pool.end();
  }
}).catch(e => { console.error('❌', e.message); process.exit(1); });
