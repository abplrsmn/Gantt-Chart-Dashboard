const { Pool } = require('pg');

const pool = new Pool({
  host: '202.83.121.156',
  port: 5433,
  user: 'cici',
  password: 'clickup123',
  database: 'cici',
  ssl: false
});

async function checkOtherTables() {
  try {
    const client = await pool.connect();
    
    const accCount = await client.query('SELECT COUNT(*) FROM master_acc;');
    const unitCount = await client.query('SELECT COUNT(*) FROM master_units;');
    const units = await client.query('SELECT unit_name, unit_code FROM master_units LIMIT 5;');
    
    console.log('Account Count:', accCount.rows[0].count);
    console.log('Unit Count:', unitCount.rows[0].count);
    console.log('Units:', units.rows);
    
    client.release();
  } catch (err) {
    console.error('Access failed:', err.message);
  } finally {
    await pool.end();
  }
}

checkOtherTables();
