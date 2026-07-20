/**
 * Patch already-imported projects' brief/summary fields in place — fixes a bug
 * where a multi-row project's continuation-row BRIEF text (col3/col11/col18 in
 * SUMMARY) was silently dropped (only the first row's brief was kept).
 * Does NOT delete/reinsert any project — only UPDATEs the affected columns,
 * matched by project_code.
 *
 *   node scripts/patch_brief_fields.mjs            # dry-run (default, no writes)
 *   node scripts/patch_brief_fields.mjs --commit    # apply
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
  host: env.PGHOST, port: Number(env.PGPORT || 5432),
  user: env.PGUSER, password: env.PGPASSWORD, database: env.PGDATABASE,
});

const projects = JSON.parse(readFileSync(resolve(__dirname, "summary_import.json"), "utf8"));
const unitCode = (raw) => raw.replace(/\s+/g, "");
const eq = (a, b) => (a ?? null) === (b ?? null);

async function main() {
  const client = await pool.connect();
  try {
    let changed = 0, missing = 0, unchanged = 0;
    for (const p of projects) {
      const code = `${unitCode(p.unit)}-${p.no}`;
      const ob = p.phases.operational_brief;
      const ds = p.phases.design;
      const pc = p.phases.project_control;

      const { rows: projRows } = await client.query(
        `SELECT id, summary_brief FROM projects WHERE project_code = $1`, [code]
      );
      if (!projRows.length) { missing++; console.log(`  MISSING: ${code}`); continue; }
      const projectId = projRows[0].id;

      const { rows: phaseRows } = await client.query(
        `SELECT phase_id, brief_text, notes FROM project_phases WHERE project_id = $1 AND phase_id IN (1,2,3)`,
        [projectId]
      );
      const ph1 = phaseRows.find(r => Number(r.phase_id) === 1); // operational_brief
      const ph2 = phaseRows.find(r => Number(r.phase_id) === 2); // design
      const ph3 = phaseRows.find(r => Number(r.phase_id) === 3); // project_control

      const projChanged = !eq(projRows[0].summary_brief, p.summary_brief);
      const ph1Changed = ph1 && !eq(ph1.brief_text, ob.brief_text);
      const ph2Changed = ph2 && !eq(ph2.brief_text, ds.brief_text);
      const ph3Changed = ph3 && !eq(ph3.notes, pc.notes);

      if (!projChanged && !ph1Changed && !ph2Changed && !ph3Changed) { unchanged++; continue; }

      changed++;
      console.log(`  ${code}:`);
      if (projChanged) console.log(`    projects.summary_brief: "${projRows[0].summary_brief}" -> "${p.summary_brief}"`);
      if (ph1Changed) console.log(`    operational_brief.brief_text: "${ph1.brief_text}" -> "${ob.brief_text}"`);
      if (ph2Changed) console.log(`    design.brief_text: "${ph2.brief_text}" -> "${ds.brief_text}"`);
      if (ph3Changed) console.log(`    project_control.notes: "${ph3.notes}" -> "${pc.notes}"`);

      if (COMMIT) {
        if (projChanged) {
          await client.query(`UPDATE projects SET summary_brief = $1 WHERE id = $2`, [p.summary_brief, projectId]);
        }
        if (ph1Changed) {
          await client.query(`UPDATE project_phases SET brief_text = $1 WHERE project_id = $2 AND phase_id = 1`, [ob.brief_text, projectId]);
        }
        if (ph2Changed) {
          await client.query(`UPDATE project_phases SET brief_text = $1 WHERE project_id = $2 AND phase_id = 2`, [ds.brief_text, projectId]);
        }
        if (ph3Changed) {
          await client.query(`UPDATE project_phases SET notes = $1 WHERE project_id = $2 AND phase_id = 3`, [pc.notes, projectId]);
        }
      }
    }
    console.log(`\n${COMMIT ? "Applied" : "Would apply"}: ${changed} changed, ${unchanged} unchanged, ${missing} missing.`);
    if (!COMMIT) console.log("Run with --commit to apply.");
  } finally {
    client.release();
    await pool.end();
  }
}

main();
