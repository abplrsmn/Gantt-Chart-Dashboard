import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

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

// POST — replace all scurve data with imported steps
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as { steps: ImportStep[] };

  if (!Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ success: false, error: "steps array required" }, { status: 400 });
  }

  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");

    // Wipe existing scurve data for project (cascade handles tasks + weeks)
    await client.query(`DELETE FROM scurve_steps WHERE project_id = $1`, [id]);

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

    await client.query("COMMIT");
    return NextResponse.json({ success: true, imported: body.steps.length, tasks: totalTasks, weeks: totalWeeks });
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
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  } finally {
    client?.release();
  }
}
