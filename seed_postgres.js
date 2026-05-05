const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: '202.83.121.156',
  port: 5433,
  user: 'cici',
  password: 'clickup123',
  database: 'cici',
  ssl: false
});

const dataPath = path.join(__dirname, 'src', 'data', 'seed_data.json');
const projects = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const parseDate = (d) => {
  if (!d) return null;
  if (d.includes('Sept')) d = d.replace('Sept', 'Sep');
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
};

const parseNumeric = (val) => {
  if (!val) return null;
  if (typeof val === 'number') return val;
  const cleaned = val.replace(/[^0-9,-]+/g, '').replace(/,/g, '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
};

const parseProgress = (prog) => {
  if (!prog) return 0;
  if (prog.includes('%')) return parseFloat(prog.replace('%', '').replace(',', '.'));
  return 0;
};

const parseIntVal = (val) => {
  if (!val) return null;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? null : parsed;
};

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Cleaning up existing data...');
    await client.query('DELETE FROM project_phases');
    await client.query('DELETE FROM projects');

    console.log('Fetching master_units...');
    const unitRes = await client.query('SELECT id, unit_code FROM master_units');
    const unitMap = {};
    unitRes.rows.forEach(u => unitMap[u.unit_code] = u.id);

    console.log('Fetching master_phases...');
    const phaseRes = await client.query('SELECT id, phase_code FROM master_phases');
    const phaseMap = {};
    phaseRes.rows.forEach(p => phaseMap[p.phase_code] = p.id);

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i];
      const ob = p.phases.operational_brief || {};
      const ds = p.phases.design || {};
      const pc = p.phases.project_control || {};
      const pm = p.phases.project_management || {};
      const ho = p.phases.handover || {};

      const dates = [
        parseDate(ob.received_date),
        parseDate(ds.start_design_date), parseDate(ds.design_approval), parseDate(ds.working_drawing),
        parseDate(pc.tender_start), parseDate(pc.spk_released),
        parseDate(pm.commence_date), parseDate(pm.end_contract), parseDate(pm.actual_completion),
        parseDate(ho.bast_1), parseDate(ho.bast_2)
      ].filter(d => d !== null);

      const start_date = dates.length > 0 ? dates.reduce((a, b) => a < b ? a : b) : null;
      const end_date = dates.length > 0 ? dates.reduce((a, b) => a > b ? a : b) : null;
      const overall_progress_pct = pm.current_site_progress ? parseProgress(pm.current_site_progress) : 0;
      const budget = parseNumeric(ob.budget_capex);
      const contract = parseNumeric(pc.contract_amount);

      const unit_id = unitMap[p.unit] || null;

      const projectInsert = await client.query(`
        INSERT INTO projects (
          project_code, project_name, unit_id, budget_capex, contract_amount, start_date, end_date, overall_progress_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id
      `, [
        `PRJ-${i+1000}`, p.projectName, unit_id, budget, contract, start_date, end_date, overall_progress_pct
      ]);

      const projectId = projectInsert.rows[0].id;

      // Phase 1: Operational Brief
      await client.query(`
        INSERT INTO project_phases (
          project_id, phase_id, brief_text, received_date, budget_capex, progress_pct
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        projectId, phaseMap['operational_brief'], ob.brief || null, parseDate(ob.received_date), parseNumeric(ob.budget_capex), 100
      ]);

      // Phase 2: Design
      await client.query(`
        INSERT INTO project_phases (
          project_id, phase_id, start_design_date, design_approval_date, design_duration_days, brief_text, working_drawing_status, progress_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        projectId, phaseMap['design'], parseDate(ds.start_design_date), parseDate(ds.design_approval), parseIntVal(ds.duration_delay), ds.brief || null, ds.working_drawing || null, ds.design_approval ? 100 : (ds.start_design_date ? 50 : 0)
      ]);

      // Phase 3: Project Control
      await client.query(`
        INSERT INTO project_phases (
          project_id, phase_id, tender_start_date, aps_spk_released_date, project_control_duration_days, phase_contract_amount, progress_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        projectId, phaseMap['project_control'], parseDate(pc.tender_start), parseDate(pc.spk_released), parseIntVal(pc.duration_delay), parseNumeric(pc.contract_amount), pc.spk_released ? 100 : (pc.tender_start ? 50 : 0)
      ]);

      // Phase 4: Project Management
      await client.query(`
        INSERT INTO project_phases (
          project_id, phase_id, commence_date, end_contract_date, actual_phase_completion_date, deviation_days, current_site_progress, progress_pct
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        projectId, phaseMap['project_management'], parseDate(pm.commence_date), parseDate(pm.end_contract), parseDate(pm.actual_completion), parseIntVal(pm.deviation), pm.current_site_progress || null, parseProgress(pm.current_site_progress)
      ]);

      // Phase 5: Handover
      await client.query(`
        INSERT INTO project_phases (
          project_id, phase_id, bast_1_date, bast_2_date, progress_pct
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        projectId, phaseMap['handover'], parseDate(ho.bast_1), parseDate(ho.bast_2), ho.bast_1 ? 100 : 0
      ]);
    }

    await client.query('COMMIT');
    console.log('Successfully inserted 50 projects into the database!');

  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', e);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
