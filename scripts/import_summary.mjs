/**
 * Import parsed SUMMARY projects into the dashboard DB.
 *
 *   node scripts/import_summary.mjs            # dry-run (default, no writes)
 *   node scripts/import_summary.mjs --commit   # wipe placeholders + insert 49
 *
 * Reads scripts/summary_import.json (produced by parse_summary.py).
 * Wipes ALL existing projects (confirmed placeholders) and inserts the real set,
 * one transaction. Each new project gets a 'project_created' audit-log row.
 */
import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMIT = process.argv.includes("--commit");

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, "../.env"), "utf8")
    .split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const { Pool } = pg;
const pool = new Pool({
  host: env.PGHOST,
  port: Number(env.PGPORT || 5432),
  user: env.PGUSER,
  password: env.PGPASSWORD,
  database: env.PGDATABASE,
});

const projects = JSON.parse(readFileSync(resolve(__dirname, "summary_import.json"), "utf8"));

// raw unit label -> clean unit_code (spaces removed). "ALV - LD" -> "ALV-LD".
const unitCode = (raw) => raw.replace(/\s+/g, "");

// SUMMARY phase key -> master_phases.phase_code
const PHASE_COLS = {
  operational_brief: ["received_date", "budget_capex", "brief_text", "raw_deadline_text", "notes"],
  design: ["start_design_date", "design_approval_target", "design_approval_date",
           "design_duration_days", "brief_text", "working_drawing_status", "notes"],
  project_control: ["tender_start_date", "tender_finish_target", "aps_spk_released_date",
                    "project_control_duration_days", "aps_date", "phase_contract_amount", "notes"],
  project_management: ["commence_date", "end_contract_date", "actual_phase_completion_date", "deviation_days", "notes"],
  handover: ["bast_1_date", "bast_2_date", "notes"],
};

async function main() {
  const client = await pool.connect();
  try {
    // Resolve phase codes -> ids
    const phaseRes = await client.query(`SELECT id, phase_code FROM master_phases`);
    const phaseId = Object.fromEntries(phaseRes.rows.map(r => [r.phase_code, Number(r.id)]));
    for (const code of Object.keys(PHASE_COLS)) {
      if (!phaseId[code]) throw new Error(`master_phases missing phase_code '${code}'`);
    }

    // Existing units
    const unitRes = await client.query(`SELECT id, unit_code FROM master_units`);
    const unitMap = new Map(unitRes.rows.map(r => [String(r.unit_code).toUpperCase(), Number(r.id)]));

    // Units needed by the import
    const neededUnits = [...new Set(projects.map(p => unitCode(p.unit)))];
    const missingUnits = neededUnits.filter(c => !unitMap.has(c.toUpperCase()));

    // Existing projects (all placeholders — to be wiped)
    const existRes = await client.query(`SELECT id FROM projects`);
    const existingIds = existRes.rows.map(r => Number(r.id));

    console.log(`Mode: ${COMMIT ? "COMMIT" : "DRY-RUN (no writes)"}`);
    console.log(`Existing projects to delete: ${existingIds.length}`);
    console.log(`New units to create: ${missingUnits.length ? missingUnits.join(", ") : "(none)"}`);
    console.log(`Projects to insert: ${projects.length}`);

    if (!COMMIT) {
      console.log("\nSample (first 3):");
      for (const p of projects.slice(0, 3)) {
        console.log(`  ${unitCode(p.unit)}-${p.no}  ${p.project_name}  prog=${p.overall_progress_pct} phase=${p.current_phase_id}`);
      }
      console.log("\nRun with --commit to apply.");
      return;
    }

    await client.query("BEGIN");

    // 1. wipe placeholders (scurve_week_actuals has no FK cascade -> delete explicitly)
    if (existingIds.length) {
      await client.query(`DELETE FROM scurve_week_actuals WHERE project_id = ANY($1)`, [existingIds]).catch(() => {});
      await client.query(`DELETE FROM projects WHERE id = ANY($1)`, [existingIds]);
    }

    // 2. create missing units
    for (const code of missingUnits) {
      const { rows } = await client.query(
        `INSERT INTO master_units (unit_code, unit_name) VALUES ($1, $2) RETURNING id`,
        [code, code]
      );
      unitMap.set(code.toUpperCase(), Number(rows[0].id));
    }

    // 3. insert projects + phases + audit
    let inserted = 0;
    for (const p of projects) {
      const uid = unitMap.get(unitCode(p.unit).toUpperCase());
      const code = `${unitCode(p.unit)}-${p.no}`;
      const { rows } = await client.query(
        `INSERT INTO projects
           (project_name, project_code, unit_id, priority_id, current_phase_id,
            start_date, end_date, summary_brief, overall_progress_pct, contract_amount,
            created_at, updated_at)
         VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         RETURNING id`,
        [p.project_name, code, uid, p.current_phase_id, p.start_date, p.end_date,
         p.summary_brief, p.overall_progress_pct ?? 0, p.phases.project_control.phase_contract_amount]
      );
      const pid = Number(rows[0].id);

      // 5 phase rows
      for (const [pcode, fields] of Object.entries(PHASE_COLS)) {
        const data = p.phases[pcode] || {};
        const cols = ["project_id", "phase_id", ...fields];
        const vals = [pid, phaseId[pcode], ...fields.map(f => data[f] ?? null)];
        const ph = cols.map((_, i) => `$${i + 1}`).join(",");
        await client.query(
          `INSERT INTO project_phases (${cols.join(",")}) VALUES (${ph})`,
          vals
        );
      }

      // audit
      await client.query(
        `INSERT INTO project_change_logs
           (project_id, entity_type, field_name, old_value, new_value, change_summary, changed_by_name, action_type, created_at)
         VALUES ($1, 'project', NULL, NULL, NULL, $2, $3, 'project_created', NOW())`,
        [pid, `Imported "${p.project_name}" (${code}) from PROJECT REPORT 2026 SUMMARY`, "Import (SUMMARY 2026)"]
      );
      inserted++;
    }

    await client.query("COMMIT");
    console.log(`\nCommitted: deleted ${existingIds.length}, created ${missingUnits.length} units, inserted ${inserted} projects.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAILED (rolled back):", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
