const { Pool } = require('pg');

const pool = new Pool({
  host: '202.83.121.156', port: 5433,
  user: 'cici', password: 'clickup123', database: 'cici', ssl: false,
});

async function main() {
  const c = await pool.connect();
  try {
    // 1. Create master_priorities table
    await c.query(`
      CREATE TABLE IF NOT EXISTS master_priorities (
        id           bigserial PRIMARY KEY,
        priority_code  varchar(20)  NOT NULL UNIQUE,
        priority_name  varchar(50)  NOT NULL,
        level          int          NOT NULL UNIQUE,   -- 1=highest
        color_hex      varchar(7)   NOT NULL DEFAULT '#6b7280',
        is_active      boolean      NOT NULL DEFAULT true,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        updated_at     timestamptz  NOT NULL DEFAULT now()
      );
    `);
    console.log('✅ Table master_priorities created (or already exists)');

    // 2. Seed the 4 levels
    await c.query(`
      INSERT INTO master_priorities (priority_code, priority_name, level, color_hex)
      VALUES
        ('CRITICAL', 'Critical', 1, '#ef4444'),
        ('HIGH',     'High',     2, '#f97316'),
        ('MID',      'Mid',      3, '#eab308'),
        ('LOW',      'Low',      4, '#22c55e')
      ON CONFLICT (priority_code) DO NOTHING;
    `);
    console.log('✅ Seed data inserted');

    // 3. Add priority_id FK to projects if not exists
    await c.query(`
      ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS priority_id bigint
          REFERENCES master_priorities(id) ON UPDATE CASCADE ON DELETE SET NULL;
    `);
    console.log('✅ Column priority_id added to projects (or already exists)');

    // 4. Create index
    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_priority_id ON projects(priority_id);
    `);

    // 5. Distribute existing projects across priorities as dummy data
    await c.query(`
      WITH ranked AS (
        SELECT id, row_number() OVER (ORDER BY id) AS rn,
               COUNT(*) OVER () AS total
        FROM projects WHERE priority_id IS NULL
      ),
      priority_map AS (
        SELECT id,
          CASE
            WHEN rn <= CEIL(total * 0.15) THEN (SELECT id FROM master_priorities WHERE priority_code = 'CRITICAL')
            WHEN rn <= CEIL(total * 0.35) THEN (SELECT id FROM master_priorities WHERE priority_code = 'HIGH')
            WHEN rn <= CEIL(total * 0.70) THEN (SELECT id FROM master_priorities WHERE priority_code = 'MID')
            ELSE                               (SELECT id FROM master_priorities WHERE priority_code = 'LOW')
          END AS priority_id
        FROM ranked
      )
      UPDATE projects p
        SET priority_id = pm.priority_id, updated_at = now()
      FROM priority_map pm
      WHERE p.id = pm.id;
    `);
    console.log('✅ Existing projects assigned dummy priorities (15% Critical, 20% High, 35% Mid, 30% Low)');

    // 6. Verify
    const result = await c.query(`
      SELECT mp.priority_name, mp.level, mp.color_hex, COUNT(p.id) AS project_count
      FROM master_priorities mp
      LEFT JOIN projects p ON p.priority_id = mp.id
      GROUP BY mp.id, mp.priority_name, mp.level, mp.color_hex
      ORDER BY mp.level;
    `);
    console.log('\n📊 Priority distribution:');
    console.table(result.rows);

  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
