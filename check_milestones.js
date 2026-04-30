const { Pool } = require('pg');

const pool = new Pool({
  host: '202.83.121.156',
  port: 5433,
  user: 'cici',
  password: 'clickup123',
  database: 'cici',
  ssl: false
});

async function checkMilestones() {
  try {
    const client = await pool.connect();
    
    // Check master_phases
    const phases = await client.query('SELECT phase_name FROM master_phases;');
    console.log('--- Master Phases (Milestones) ---');
    phases.rows.forEach(r => console.log(`- ${r.phase_name}`));
    
    // Check if there are any records in project_phases
    const projectPhases = await client.query('SELECT COUNT(*) FROM project_phases;');
    console.log('\nTotal Records in project_phases:', projectPhases.rows[0].count);
    
    client.release();
  } catch (err) {
    console.error('Access failed:', err.message);
  } finally {
    await pool.end();
  }
}

checkMilestones();
