const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

async function main() {
  const c = await pool.connect();
  try {
    // Get all phase IDs
    const phases = await c.query('SELECT id FROM master_phases ORDER BY id');
    const phaseIds = phases.rows.map(r => r.id);

    // Get all status IDs
    const statuses = await c.query("SELECT id FROM master_statuses WHERE entity_type = 'project' AND is_active = true ORDER BY id");
    const statusIds = statuses.rows.map(r => r.id);

    console.log('Phases:', phaseIds);
    console.log('Statuses:', statusIds);

    // Get all project IDs
    const projects = await c.query('SELECT id FROM projects ORDER BY id');
    const projectIds = projects.rows.map(r => r.id);

    console.log(`\nUpdating ${projectIds.length} projects...`);

    // Assign phases and statuses one by one using round-robin
    for (let i = 0; i < projectIds.length; i++) {
      const phaseId = phaseIds[i % phaseIds.length];
      const statusId = statusIds[i % statusIds.length];
      await c.query(
        'UPDATE projects SET current_phase_id = $1, overall_status_id = $2 WHERE id = $3',
        [phaseId, statusId, projectIds[i]]
      );
    }

    console.log('✅ Done! Phase & status distribution:');

    // Verify distribution
    const res = await c.query(`
      SELECT p.project_code, p.project_name, mp.phase_name, ms.status_label 
      FROM projects p
      LEFT JOIN master_phases mp ON p.current_phase_id = mp.id
      LEFT JOIN master_statuses ms ON p.overall_status_id = ms.id
      ORDER BY p.id
    `);
    console.table(res.rows);

  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
