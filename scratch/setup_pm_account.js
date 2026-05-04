const { Pool } = require('pg');

const pool = new Pool({
  host: '202.83.121.156',
  port: 5433,
  user: 'cici',
  password: 'clickup123',
  database: 'cici',
  ssl: false,
});

async function main() {
  const c = await pool.connect();
  try {
    // 1. Add role column
    await c.query(
      "ALTER TABLE master_acc ADD COLUMN IF NOT EXISTS role varchar(50) NOT NULL DEFAULT 'admin'"
    );
    console.log('✅ Column role ensured');

    // 2. Tag existing admin
    const r1 = await c.query(
      "UPDATE master_acc SET role = 'admin' WHERE lower(email) = lower('admin@aryaduta.com')"
    );
    console.log('✅ admin role updated:', r1.rowCount, 'row(s)');

    // 3. Insert PM person
    await c.query(
      "INSERT INTO master_people (employee_code, full_name, nickname, department, job_title, email, is_active) " +
      "SELECT 'EMP-PM','PM Team','PM','Project Management','Project Manager','pm@aryaduta.com',true " +
      "WHERE NOT EXISTS (SELECT 1 FROM master_people WHERE lower(email)=lower('pm@aryaduta.com'))"
    );
    console.log('✅ PM person ensured');

    // 4. Insert PM account
    const r2 = await c.query(
      "INSERT INTO master_acc (person_id, email, password_plain, is_admin, is_active, role) " +
      "SELECT mp.id,'pm@aryaduta.com','pm@2025',false,true,'pm' " +
      "FROM master_people mp " +
      "WHERE lower(mp.email)=lower('pm@aryaduta.com') " +
      "AND NOT EXISTS (SELECT 1 FROM master_acc WHERE lower(email)=lower('pm@aryaduta.com'))"
    );
    console.log('✅ PM account inserted:', r2.rowCount, 'row(s)');

    // 5. Verify
    const verify = await c.query(
      'SELECT id, email, is_admin, role, is_active FROM master_acc ORDER BY id'
    );
    console.log('\n📋 Current accounts:');
    console.table(verify.rows);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
