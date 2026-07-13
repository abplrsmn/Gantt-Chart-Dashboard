import pg from "pg";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
  ssl: false,
});

const sql = `
CREATE TABLE IF NOT EXISTS scurve_steps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  letter      VARCHAR(2) NOT NULL,
  name        TEXT NOT NULL,
  step_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scurve_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id     UUID NOT NULL REFERENCES scurve_steps(id) ON DELETE CASCADE,
  project_id  BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit        VARCHAR(50),
  vol         VARCHAR(50),
  bobot       NUMERIC(9,5) DEFAULT 0,
  task_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scurve_task_weeks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES scurve_tasks(id) ON DELETE CASCADE,
  week_date   DATE NOT NULL,
  plan_pct    NUMERIC(9,5) DEFAULT 0,
  actual_pct  NUMERIC(9,5) DEFAULT 0,
  UNIQUE(task_id, week_date)
);

-- Widen precision on existing installs so full-precision weekly values are
-- kept (2-decimal storage summed to 99.92% instead of 100%). Idempotent.
ALTER TABLE scurve_tasks      ALTER COLUMN bobot      TYPE NUMERIC(9,5);
ALTER TABLE scurve_task_weeks ALTER COLUMN plan_pct   TYPE NUMERIC(9,5);
ALTER TABLE scurve_task_weeks ALTER COLUMN actual_pct TYPE NUMERIC(9,5);
`;

const client = await pool.connect();
try {
  await client.query(sql);
  console.log("✅ scurve_steps, scurve_tasks, scurve_task_weeks created (if not exists)");
} finally {
  client.release();
  await pool.end();
}
