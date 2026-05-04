const { Pool } = require('pg');
const pool = new Pool({ host:'202.83.121.156', port:5433, user:'cici', password:'clickup123', database:'cici', ssl:false });

// Add N days to a date string 'YYYY-MM-DD'
function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Random int between min and max (inclusive)
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Random item from array
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  const c = await pool.connect();
  try {
    const projects = await c.query('SELECT id, project_code, start_date, end_date, overall_status_id FROM projects ORDER BY id');
    const phases   = await c.query('SELECT id, phase_code FROM master_phases ORDER BY id');
    const statuses = await c.query("SELECT id FROM master_statuses WHERE entity_type='project' AND is_active=true ORDER BY id");

    const phaseMap = {}; // code -> id
    for (const p of phases.rows) phaseMap[p.phase_code] = p.id;

    const statusIds = statuses.rows.map(r => r.id);

    const workingDrawingStatuses = ['In Progress', 'Completed', 'Pending Review', 'Approved'];

    let insertCount = 0;

    for (const proj of projects.rows) {
      // Base start: use project start_date or fallback to a random 2024 date
      const baseStart = proj.start_date
        ? proj.start_date.toISOString().slice(0, 10)
        : `2024-${String(randInt(1, 6)).padStart(2, '0')}-${String(randInt(1, 28)).padStart(2, '0')}`;

      // Build timeline: each phase runs sequentially
      // Phase 1: Operational Brief (received → 30-45 days)
      const brief_received  = baseStart;
      const brief_days      = randInt(20, 40);
      const brief_deadline  = addDays(brief_received, brief_days);

      // Phase 2: Design (starts after brief)
      const design_start    = addDays(brief_deadline, randInt(3, 10));
      const design_duration = randInt(30, 60);
      const design_approval = addDays(design_start, design_duration);

      // Phase 3: Project Control / Tender (starts after design)
      const tender_start    = addDays(design_approval, randInt(5, 14));
      const spk_released    = addDays(tender_start, randInt(15, 30));
      const pc_duration     = randInt(14, 25);

      // Phase 4: Project Management / Construction
      const commence        = addDays(spk_released, randInt(3, 7));
      const deviation       = randInt(-10, 30); // negative = ahead of schedule
      const orig_end        = proj.end_date
        ? proj.end_date.toISOString().slice(0, 10)
        : addDays(commence, randInt(60, 180));
      const end_contract    = addDays(orig_end, deviation);

      // Phase 5: Handover
      const bast1          = addDays(end_contract, randInt(3, 10));
      const bast2          = addDays(bast1, randInt(14, 30));
      const completion     = addDays(bast2, randInt(5, 14));

      const budget = randInt(500, 15000) * 1_000_000; // 500 jt - 15 M
      const contractAmt = budget * (0.85 + Math.random() * 0.3);

      const phaseRows = [
        // 1. Operational Brief
        {
          phase_code: 'operational_brief',
          progress_pct: 100,
          received_date: brief_received,
          normalized_deadline_date: brief_deadline,
          normalized_deadline_period: `Q${Math.ceil(new Date(brief_deadline).getMonth() / 3) || 1} ${new Date(brief_deadline).getFullYear()}`,
          brief_text: `Initial scope brief for ${proj.project_code} covering renovation requirements and budget allocation.`,
          budget_capex: budget,
          notes: 'Brief received and reviewed by asset management team.',
        },
        // 2. Design
        {
          phase_code: 'design',
          progress_pct: randInt(40, 100),
          start_design_date: design_start,
          design_approval_date: design_approval,
          design_duration_days: design_duration,
          working_drawing_status: pick(workingDrawingStatuses),
          notes: 'Consultant engaged. Design drawings under review.',
        },
        // 3. Project Control
        {
          phase_code: 'project_control',
          progress_pct: randInt(30, 90),
          tender_start_date: tender_start,
          aps_spk_released_date: spk_released,
          project_control_duration_days: pc_duration,
          phase_contract_amount: Math.round(contractAmt),
          notes: 'Tender process completed. SPK/APS released to contractor.',
        },
        // 4. Project Management
        {
          phase_code: 'project_management',
          progress_pct: randInt(20, 85),
          commence_date: commence,
          end_contract_date: end_contract,
          deviation_days: deviation,
          current_site_progress: `${randInt(10, 95)}% - ${pick(['civil works', 'MEP installation', 'finishing', 'structural works', 'fit-out'])} ongoing`,
          notes: deviation > 0 ? `Project running ${deviation} days behind schedule.` : `Project on track, ${Math.abs(deviation)} days ahead.`,
        },
        // 5. Handover
        {
          phase_code: 'handover',
          progress_pct: randInt(0, 70),
          bast_1_date: bast1,
          bast_2_date: bast2,
          actual_phase_completion_date: completion,
          notes: 'BAST-1 issued pending final defect clearance.',
        },
      ];

      for (const pr of phaseRows) {
        const phaseId = phaseMap[pr.phase_code];
        const statusId = pick(statusIds);

        await c.query(`
          INSERT INTO project_phases (
            project_id, phase_id, status_id, progress_pct,
            raw_deadline_text, normalized_deadline_date, normalized_deadline_period,
            brief_text, notes,
            received_date, budget_capex,
            start_design_date, design_approval_date, design_duration_days, working_drawing_status,
            tender_start_date, aps_spk_released_date, project_control_duration_days, phase_contract_amount,
            commence_date, end_contract_date, deviation_days, current_site_progress,
            bast_1_date, bast_2_date, actual_phase_completion_date,
            sync_status, created_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,
            $5,$6,$7,
            $8,$9,
            $10,$11,
            $12,$13,$14,$15,
            $16,$17,$18,$19,
            $20,$21,$22,$23,
            $24,$25,$26,
            'manual', now(), now()
          )
          ON CONFLICT DO NOTHING
        `, [
          proj.id, phaseId, statusId, pr.progress_pct,
          pr.normalized_deadline_date ?? null,
          pr.normalized_deadline_date ?? null,
          pr.normalized_deadline_period ?? null,
          pr.brief_text ?? null, pr.notes ?? null,
          pr.received_date ?? null, pr.budget_capex ?? null,
          pr.start_design_date ?? null, pr.design_approval_date ?? null,
          pr.design_duration_days ?? null, pr.working_drawing_status ?? null,
          pr.tender_start_date ?? null, pr.aps_spk_released_date ?? null,
          pr.project_control_duration_days ?? null, pr.phase_contract_amount ?? null,
          pr.commence_date ?? null, pr.end_contract_date ?? null,
          pr.deviation_days ?? null, pr.current_site_progress ?? null,
          pr.bast_1_date ?? null, pr.bast_2_date ?? null, pr.actual_phase_completion_date ?? null,
        ]);
        insertCount++;
      }
      console.log(`✅ ${proj.project_code} — 5 phases inserted`);
    }

    console.log(`\n🎉 Total rows inserted: ${insertCount}`);

    // Summary by phase
    const summary = await c.query(`
      SELECT mp.phase_name, COUNT(pp.id) as count,
             ROUND(AVG(pp.progress_pct)) as avg_progress
      FROM project_phases pp
      JOIN master_phases mp ON pp.phase_id = mp.id
      GROUP BY mp.id, mp.phase_name
      ORDER BY mp.id
    `);
    console.log('\n📊 Phase summary:');
    console.table(summary.rows);

  } finally {
    c.release();
    await pool.end();
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
