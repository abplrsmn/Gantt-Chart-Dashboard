const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

async function main() {
  const c = await pool.connect();
  try {
    // Get priority IDs
    const prios = await c.query('SELECT id, priority_code FROM master_priorities ORDER BY level');
    const p = {};
    for (const r of prios.rows) p[r.priority_code] = r.id;
    console.log('Priority IDs:', p);

    // Get or create a default unit_id (use first available or null)
    const units = await c.query('SELECT id FROM master_units LIMIT 1');
    const unitId = units.rows[0]?.id ?? null;

    // Get or create default category_id
    const cats = await c.query('SELECT id FROM master_project_categories LIMIT 1');
    const catId = cats.rows[0]?.id ?? null;

    const today = new Date().toISOString().slice(0, 10);

    const dummyProjects = [
      // CRITICAL
      { code:'PRJ-001', name:'Emergency HVAC Replacement - Hotel Aryaduta Jakarta', priority:'CRITICAL', progress:25, start:'2025-01-15', end:'2025-04-30', site:'Mobilization' },
      { code:'PRJ-002', name:'Roof Waterproofing Repair - Aryaduta Medan', priority:'CRITICAL', progress:60, start:'2025-02-01', end:'2025-05-15', site:'65% - ongoing repair' },
      { code:'PRJ-003', name:'Lift Modernization - Tower B Lobby', priority:'CRITICAL', progress:10, start:'2025-03-01', end:'2025-06-30', site:'Design phase' },
      // HIGH
      { code:'PRJ-004', name:'Ballroom Renovation - Grand Aryaduta Pekanbaru', priority:'HIGH', progress:45, start:'2025-01-01', end:'2025-07-31', site:'45% - structural works' },
      { code:'PRJ-005', name:'Swimming Pool Refurbishment - Aryaduta Lippo Village', priority:'HIGH', progress:70, start:'2024-11-01', end:'2025-04-30', site:'Final finishing' },
      { code:'PRJ-006', name:'F&B Area Fit-Out - Aryaduta Makassar', priority:'HIGH', progress:30, start:'2025-02-15', end:'2025-08-15', site:'30% - MEP installation' },
      { code:'PRJ-007', name:'Guestroom Upgrade Floor 3-5 - Aryaduta Jakarta', priority:'HIGH', progress:85, start:'2024-10-01', end:'2025-05-01', site:'Almost complete - defect check' },
      // MID
      { code:'PRJ-008', name:'Lobby Interior Refresh - Aryaduta Bandung', priority:'MID', progress:50, start:'2025-01-20', end:'2025-06-20', site:'50% - millwork in progress' },
      { code:'PRJ-009', name:'Car Park Resurfacing - Aryaduta Semanggi', priority:'MID', progress:20, start:'2025-03-01', end:'2025-09-01', site:'Mobilization started' },
      { code:'PRJ-010', name:'Back of House Kitchen Upgrade', priority:'MID', progress:65, start:'2024-12-01', end:'2025-04-30', site:'Equipment installation' },
      { code:'PRJ-011', name:'Laundry Area Expansion - Aryaduta Medan', priority:'MID', progress:40, start:'2025-02-01', end:'2025-07-01', site:'Civil works 40%' },
      { code:'PRJ-012', name:'Gym & Spa Renovation - Aryaduta Pekanbaru', priority:'MID', progress:15, start:'2025-03-15', end:'2025-10-15', site:'Design finalisation' },
      { code:'PRJ-013', name:'IT Infrastructure Upgrade - All Properties', priority:'MID', progress:55, start:'2025-01-01', end:'2025-06-30', site:'55% - cabling done' },
      // LOW
      { code:'PRJ-014', name:'Staff Locker Room Renovation - Aryaduta Jakarta', priority:'LOW', progress:0, start:'2025-06-01', end:'2025-09-30', site:'Awaiting tender award' },
      { code:'PRJ-015', name:'Executive Lounge Soft Refurbishment - Aryaduta Lippo', priority:'LOW', progress:5, start:'2025-05-01', end:'2025-08-31', site:'Awaiting material procurement' },
      { code:'PRJ-016', name:'Signage & Wayfinding Update', priority:'LOW', progress:80, start:'2024-11-15', end:'2025-03-31', site:'Final installation phase' },
      { code:'PRJ-017', name:'Rooftop Bar Feasibility Study', priority:'LOW', progress:100, start:'2024-09-01', end:'2025-01-31', site:'Completed' },
      { code:'PRJ-018', name:'Storage Area Re-organisation - Aryaduta Makassar', priority:'LOW', progress:35, start:'2025-04-01', end:'2025-07-31', site:'In progress' },
    ];

    let inserted = 0;
    for (const proj of dummyProjects) {
      await c.query(`
        INSERT INTO projects (
          project_code, project_name, unit_id, category_id,
          overall_progress_pct, start_date, end_date,
          current_site_progress, priority_id,
          sync_status, created_at, updated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual',now(),now())
        ON CONFLICT DO NOTHING
      `, [
        proj.code, proj.name, unitId, catId,
        proj.progress, proj.start, proj.end,
        proj.site, p[proj.priority],
      ]);
      inserted++;
    }
    console.log(`✅ Inserted ${inserted} dummy projects`);

    // Summary
    const summary = await c.query(`
      SELECT mp.priority_name, mp.color_hex, COUNT(p.id) AS project_count
      FROM master_priorities mp
      LEFT JOIN projects p ON p.priority_id = mp.id
      GROUP BY mp.id, mp.priority_name, mp.color_hex, mp.level
      ORDER BY mp.level;
    `);
    console.log('\n📊 Priority distribution:');
    console.table(summary.rows);

  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
