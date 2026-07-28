import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getAuthUserFromCookie } from "@/lib/auth";
import { generateReply, isGeminiConfigured, GeminiNotConfiguredError, type GeminiTurn } from "@/lib/gemini";
import type { PoolClient } from "pg";

export const dynamic = "force-dynamic";

/** How many prior turns to replay to Gemini for context. */
const HISTORY_LIMIT = 20;

/**
 * Pulls a compact snapshot of live project data so the assistant can answer
 * questions about actual portfolio state rather than guessing.
 */
async function buildProjectContext(client: PoolClient): Promise<string> {
  const { rows } = await client.query(
    `SELECT p.project_code,
            p.project_name,
            mu.unit_name,
            mph.phase_name,
            ms.status_label,
            p.overall_progress_pct,
            p.start_date,
            p.end_date,
            p.blocker_note,
            p.next_action_note
       FROM projects p
       LEFT JOIN master_units      mu  ON mu.id  = p.unit_id
       LEFT JOIN master_phases     mph ON mph.id = p.current_phase_id
       LEFT JOIN master_statuses   ms  ON ms.id  = p.overall_status_id
      ORDER BY p.end_date ASC NULLS LAST
      LIMIT 150`
  );

  if (rows.length === 0) return "There are currently no projects in the database.";

  const fmt = (d: unknown) =>
    d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : "—";

  const lines = rows.map((r) => {
    const bits = [
      `${r.project_code ?? "?"} — ${r.project_name ?? "Untitled"}`,
      `unit: ${r.unit_name ?? "—"}`,
      `phase: ${r.phase_name ?? "—"}`,
      `status: ${r.status_label ?? "—"}`,
      `progress: ${r.overall_progress_pct ?? 0}%`,
      `window: ${fmt(r.start_date)} → ${fmt(r.end_date)}`,
    ];
    if (r.blocker_note) bits.push(`blocker: ${String(r.blocker_note).slice(0, 160)}`);
    if (r.next_action_note) bits.push(`next: ${String(r.next_action_note).slice(0, 160)}`);
    return `- ${bits.join(" | ")}`;
  });

  return `Live project data (${rows.length} projects, today is ${new Date().toISOString().slice(0, 10)}):\n${lines.join("\n")}`;
}

/**
 * Pulls the people roster + who's assigned to what, so the assistant can
 * answer "who's on the team" / "who's the PIC for X" questions.
 *
 * Deliberately excludes phone_number / telegram_id / whatsapp_id — those are
 * personal contact channels, not needed to answer roster/assignment
 * questions, and this context is sent to an external API (Gemini). Name,
 * department, job title, and work email are treated like an internal company
 * directory; direct personal contact details are not.
 */
async function buildTeamContext(client: PoolClient): Promise<string> {
  const roster = await client.query(
    `SELECT mp.full_name, mp.nickname, mp.department, mp.job_title, mp.email,
            EXISTS (
              SELECT 1 FROM master_acc a WHERE a.person_id = mp.id AND a.is_active
            ) AS has_dashboard_login
       FROM master_people mp
      WHERE mp.is_active = true
      ORDER BY mp.department NULLS LAST, mp.full_name
      LIMIT 200`
  );

  const rosterLines = roster.rows.map((r) => {
    const bits = [r.full_name, r.department ? `dept: ${r.department}` : null, r.job_title ?? null]
      .filter(Boolean)
      .join(" | ");
    return `- ${bits}${r.has_dashboard_login ? " (has dashboard login)" : ""}`;
  });

  const assignments = await client.query(
    `SELECT p.project_code, p.project_name, mr.role_name,
            COALESCE(mpl.full_name, pp.raw_person_name) AS person,
            pp.raw_organization_name AS organization
       FROM project_people pp
       JOIN projects p ON p.id = pp.project_id
       LEFT JOIN master_roles  mr  ON mr.id = pp.role_id
       LEFT JOIN master_people mpl ON mpl.id = pp.person_id
      WHERE COALESCE(mpl.full_name, pp.raw_person_name) IS NOT NULL
      ORDER BY p.project_code
      LIMIT 300`
  );

  const assignmentLines = assignments.rows.map((r) => {
    const role = r.role_name ? `${r.role_name}: ` : "";
    const org = r.organization ? ` (${r.organization})` : "";
    return `- ${r.project_code ?? "?"} — ${r.project_name ?? "Untitled"}: ${role}${r.person}${org}`;
  });

  return [
    `Team roster (${roster.rows.length} people):`,
    rosterLines.join("\n") || "(none)",
    "",
    `Project assignments (${assignments.rows.length} entries, who is involved in which project):`,
    assignmentLines.join("\n") || "(none)",
  ].join("\n");
}

function buildSystemPrompt(userName: string, projectContext: string, teamContext: string): string {
  return [
    "You are Keystone Assistant, an AI helper embedded in a CAPEX (capital expenditure) project management dashboard for a hotel group.",
    `You are talking to ${userName}.`,
    "",
    "Projects move through 5 fixed phases in order: Operational Brief → Design → Project Control → Project Management → Handover.",
    "Progress is tracked with S-curves (planned vs actual weekly weights) and Gantt timelines.",
    "",
    "Capabilities:",
    "- You have live, read-only access to this dashboard's project data and team roster (below) — treat it as ground truth over anything you'd otherwise guess.",
    "- You can also search the web (Google Search grounding) for anything outside this dashboard: general knowledge, current events, material/vendor prices, standards, definitions, etc. Use it when the dashboard data doesn't cover the question — don't guess when a quick search would give a real answer. When you do search, sources are appended automatically; don't fabricate citations yourself.",
    "- You can answer questions about teammates (who they are, their department/role, which projects they're assigned to). You do not have anyone's phone number or personal messaging IDs — say so if asked, rather than inventing one.",
    "",
    "Guidelines:",
    "- Answer using the live data below whenever the question touches project status, deadlines, progress, risk, or team/people.",
    "- Be concise and practical. Prefer short paragraphs and bullet lists over long prose.",
    "- When you cite a project, use its code and name.",
    "- If the dashboard data doesn't contain the answer and a web search wouldn't help either, say so plainly instead of inventing an answer.",
    "- You may reason about dates relative to today, flag overdue or near-deadline projects, and suggest next actions.",
    "- Reply in the same language the user writes in (they may use English or Bahasa Indonesia).",
    "",
    projectContext,
    "",
    teamContext,
  ].join("\n");
}

/** POST /api/chat/ai  { body } — appends a user turn, calls Gemini, stores + returns the reply. */
export async function POST(request: Request) {
  const user = await getAuthUserFromCookie();
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      {
        success: false,
        error:
          "AI assistant is not configured. Add GEMINI_API_KEY to your .env (get one at https://aistudio.google.com/apikey), then restart the dev server.",
      },
      { status: 503 }
    );
  }

  let payload: { body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return NextResponse.json({ success: false, error: "Message cannot be empty" }, { status: 400 });
  }
  if (body.length > 4000) {
    return NextResponse.json({ success: false, error: "Message too long (max 4000 chars)" }, { status: 400 });
  }

  const senderName = user.fullName ?? user.email ?? "Unknown";
  const pool = getDbPool();
  const client = await pool.connect();

  try {
    // 1. Persist the user's turn first, so it survives even if the model call fails.
    const inserted = await client.query(
      `INSERT INTO chat_messages (room, acc_id, sender_name, role, body)
       VALUES ('ai', $1, $2, 'user', $3)
       RETURNING id, room, acc_id, sender_name, role, body, created_at`,
      [user.accId, senderName, body]
    );
    const userMessage = { ...inserted.rows[0], mine: true };

    // 2. Replay recent turns (oldest → newest) for conversational context.
    const historyRes = await client.query(
      `SELECT role, body FROM (
         SELECT id, role, body
           FROM chat_messages
          WHERE room = 'ai' AND acc_id = $1
          ORDER BY id DESC
          LIMIT $2
       ) recent ORDER BY id ASC`,
      [user.accId, HISTORY_LIMIT]
    );
    const history: GeminiTurn[] = historyRes.rows.map((r) => ({
      role: r.role === "assistant" ? "assistant" : "user",
      body: r.body,
    }));

    const [projectContext, teamContext] = await Promise.all([
      buildProjectContext(client),
      buildTeamContext(client),
    ]);
    const reply = await generateReply(history, buildSystemPrompt(senderName, projectContext, teamContext));

    // 3. Persist the assistant turn (acc_id scopes it to this user's private thread).
    const replyRes = await client.query(
      `INSERT INTO chat_messages (room, acc_id, sender_name, role, body)
       VALUES ('ai', $1, 'Keystone Assistant', 'assistant', $2)
       RETURNING id, room, acc_id, sender_name, role, body, created_at`,
      [user.accId, reply]
    );

    return NextResponse.json({
      success: true,
      userMessage,
      reply: { ...replyRes.rows[0], mine: false },
    });
  } catch (e) {
    if (e instanceof GeminiNotConfiguredError) {
      return NextResponse.json({ success: false, error: e.message }, { status: 503 });
    }
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "AI request failed" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
