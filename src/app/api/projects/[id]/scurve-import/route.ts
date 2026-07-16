import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { logChange, getChangedByName } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

type ImportWeek = {
  week_date: string;
  plan_pct: number;
  actual_pct: number;
};

type ImportTask = {
  name: string;
  unit: string;
  vol: string;
  bobot: number;
  weeks: ImportWeek[];
};

type ImportStep = {
  letter: string;
  name: string;
  tasks: ImportTask[];
};

type ImportWeekActual = {
  week_date: string;
  cum_actual_pct: number;
};

// POST — replace all scurve data with imported steps
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { steps: ImportStep[]; weekActuals?: ImportWeekActual[] };

  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ success: false, error: "steps array required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    // Ensure columns can hold full precision (older installs used NUMERIC(7,3),
    // which rounded 0.31452 → 0.315 and displayed as 0.32). Idempotent no-op if
    // already widened. Run outside the transaction to avoid holding locks on fail.
    await client.query(`ALTER TABLE scurve_tasks      ALTER COLUMN bobot      TYPE NUMERIC(9,5)`).catch(() => {});
    await client.query(`ALTER TABLE scurve_task_weeks ALTER COLUMN plan_pct   TYPE NUMERIC(9,5)`).catch(() => {});
    await client.query(`ALTER TABLE scurve_task_weeks ALTER COLUMN actual_pct TYPE NUMERIC(9,5)`).catch(() => {});
    await client.query(`
      CREATE TABLE IF NOT EXISTS scurve_week_actuals (
        project_id     BIGINT NOT NULL,
        week_date      DATE NOT NULL,
        cum_actual_pct NUMERIC(9,5) NOT NULL DEFAULT 0,
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (project_id, week_date)
      )
    `).catch(() => {});

    await client.query("BEGIN");

    // Wipe existing scurve data for project (cascade handles tasks + weeks)
    await client.query(`DELETE FROM scurve_steps WHERE project_id = $1`, [id]);
    // Wipe existing cumulative-actual entries too — re-imported fresh below
    await client.query(`DELETE FROM scurve_week_actuals WHERE project_id = $1`, [id]);

    let totalTasks = 0;
    let totalWeeks = 0;

    for (let si = 0; si < body.steps.length; si++) {
      const step = body.steps[si];

      const { rows: [stepRow] } = await client.query(
        `INSERT INTO scurve_steps (project_id, letter, name, step_order)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [id, step.letter, step.name, si]
      );

      for (let ti = 0; ti < step.tasks.length; ti++) {
        const task = step.tasks[ti];

        const { rows: [taskRow] } = await client.query(
          `INSERT INTO scurve_tasks (step_id, project_id, name, unit, vol, bobot, task_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [stepRow.id, id, task.name, task.unit ?? "", task.vol ?? "", task.bobot, ti]
        );
        totalTasks++;

        for (const week of task.weeks) {
          if (week.plan_pct === 0 && week.actual_pct === 0) continue;
          await client.query(
            `INSERT INTO scurve_task_weeks (task_id, week_date, plan_pct, actual_pct)
             VALUES ($1, $2, $3, $4)`,
            [taskRow.id, week.week_date, week.plan_pct, week.actual_pct]
          );
          totalWeeks++;
        }
      }
    }

    // Cumulative actual (realisasi kumulatif) per week from the Excel
    let totalActuals = 0;
    for (const wa of body.weekActuals ?? []) {
      if (!wa.week_date) continue;
      await client.query(
        `INSERT INTO scurve_week_actuals (project_id, week_date, cum_actual_pct, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (project_id, week_date)
         DO UPDATE SET cum_actual_pct = EXCLUDED.cum_actual_pct, updated_at = NOW()`,
        [id, wa.week_date, Math.max(0, wa.cum_actual_pct ?? 0)]
      );
      totalActuals++;
    }

    await logChange(client, {
      projectId: id,
      entityType: "scurve",
      changeSummary: `S-curve imported — ${body.steps.length} steps, ${totalTasks} tasks, ${totalWeeks} week entries, ${totalActuals} cumulative actuals (replaces previous data)`,
      changedByName: await getChangedByName(),
      actionType: "scurve_imported",
    });

    await client.query("COMMIT");
    return NextResponse.json({ success: true, imported: body.steps.length, tasks: totalTasks, weeks: totalWeeks, actuals: totalActuals });
  } catch (err: unknown) {
    await client?.query("ROLLBACK").catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}

// DELETE — wipe all scurve data for project
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query(`DELETE FROM scurve_steps WHERE project_id = $1`, [id]);
    await client.query(`DELETE FROM scurve_week_actuals WHERE project_id = $1`, [id]).catch(() => {});

    await logChange(client, {
      projectId: id,
      entityType: "scurve",
      changeSummary: "S-curve data wiped",
      changedByName: await getChangedByName(),
      actionType: "scurve_deleted",
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
