const { Pool } = require('pg');

const pool = new Pool({
  host: '202.83.121.156',
  port: 5433,
  user: 'cici',
  password: 'clickup123',
  database: 'cici',
  ssl: false
});

async function proveAccess() {
  try {
    const client = await pool.connect();
    
    // Get total project count
    const projectCount = await client.query('SELECT COUNT(*) FROM projects;');
    
    // Get top 3 latest projects
    const latestProjects = await client.query('SELECT project_name, created_at FROM projects ORDER BY created_at DESC LIMIT 3;');
    
    // Get an admin user name (masking email for safety)
    const adminUser = await client.query("SELECT email, is_admin FROM master_acc WHERE is_admin = true LIMIT 1;");
    
    console.log('--- Database Proof ---');
    console.log('Total Projects:', projectCount.rows[0].count);
    console.log('Latest 3 Projects:');
    latestProjects.rows.forEach(p => console.log(`- ${p.project_name} (Created: ${p.created_at})`));
    if (adminUser.rows.length > 0) {
      console.log('Found Admin User:', adminUser.rows[0].email.split('@')[0] + '@...');
    }
    
    client.release();
  } catch (err) {
    console.error('Access failed:', err.message);
  } finally {
    await pool.end();
  }
}

proveAccess();
