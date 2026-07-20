/**
 * Patch the already-imported 49 projects' project_management phase row
 * in place — fixes the col22/26/27 handling bug in the original import
 * (raw "+/- (col22): ..." debug text in `notes`, `deviation_days` never set).
 * Does NOT delete or reinsert any project — only UPDATEs notes/deviation_days
 * on the existing project_phases row, matched by project_code.
 *
 *   node scripts/patch_pm_fields.mjs            # dry-run (default, no writes)
 *   node scripts/patch_pm_fields.mjs --commit    # apply
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

async function main() {
  const client = await pool.connect();
  try {
    let changed = 0, missing = 0, unchanged = 0;
    for (const p of projects) {
      const code = `${unitCode(p.unit)}-${p.no}`;
      const pm = p.phases.project_management;

      const { rows } = await client.query(
        `SELECT pp.id, pp.notes, pp.deviation_days
         FROM project_phases pp JOIN projects pr ON pr.id = pp.project_id
         WHERE pr.project_code = $1 AND pp.phase_id = 4`,
        [code]
      );
      if (!rows.length) { missing++; console.log(`  MISSING: ${code}`); continue; }
      const row = rows[0];

      const notesSame = (row.notes ?? null) === (pm.notes ?? null);
      const devSame = (row.deviation_days ?? null) === (pm.deviation_days ?? null);
      if (notesSame && devSame) { unchanged++; continue; }

      changed++;
      console.log(`  ${code}: notes "${row.notes}" -> "${pm.notes}" | deviation_days ${row.deviation_days} -> ${pm.deviation_days}`);
      if (COMMIT) {
        await client.query(
          `UPDATE project_phases SET notes = $1, deviation_days = $2 WHERE id = $3`,
          [pm.notes, pm.deviation_days, row.id]
        );
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
