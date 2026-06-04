import { getDbPool } from "@/lib/db";
import { sendNotification } from "@/lib/gchat";
import { differenceInCalendarDays, format } from "date-fns";
import { id as localeId } from "date-fns/locale";

type Project = {
  id: string;
  project_name: string;
  project_code: string;
  unit_code: string | null;
  unit_name: string | null;
  end_date: string | null;
  start_date: string | null;
  overall_progress_pct: string | null;
  current_phase_name: string | null;
  priority_name: string | null;
  priority_code: string | null;
  status_label: string | null;
};

const PRIORITY_EMOJI: Record<string, string> = {
  CRITICAL: "🔴",
  HIGH:     "🟠",
  MID:      "🟡",
  LOW:      "🟢",
};

function progressBar(pct: number, width = 8): string {
  const filled = Math.round((pct / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
}

function fmt(p: Project, extra: string): string {
  const emoji = PRIORITY_EMOJI[p.priority_code ?? ""] ?? "⚪";
  const unit  = p.unit_code ? `[${p.unit_code}] ` : "";
  const pct   = Math.round(Number(p.overall_progress_pct ?? 0));
  const bar   = progressBar(pct, 6);
  const name  = p.project_name.length > 40
    ? p.project_name.slice(0, 38) + "…"
    : p.project_name;
  return `${emoji} *${unit}${name}*\n    ${bar} ${pct}%  •  ${extra}`;
}

export async function runAlertNotification(): Promise<{ sent: boolean; total: number; message?: string }> {
  const pool = getDbPool();
  let client;
  try {
    client = await pool.connect();

    const { rows } = await client.query<Project>(`
      SELECT
        p.id,
        p.project_code,
        p.project_name,
        p.start_date,
        p.end_date,
        p.overall_progress_pct,
        mu.unit_code,
        mu.unit_name,
        mp.phase_name   AS current_phase_name,
        mpr.priority_name,
        mpr.priority_code,
        ms.status_label
      FROM projects p
      LEFT JOIN master_units      mu  ON mu.id  = p.unit_id
      LEFT JOIN master_phases     mp  ON mp.id  = p.current_phase_id
      LEFT JOIN master_priorities mpr ON mpr.id = p.priority_id
      LEFT JOIN master_statuses   ms  ON ms.id  = p.overall_status_id
      WHERE (p.overall_progress_pct IS NULL OR p.overall_progress_pct::numeric < 100)
      ORDER BY mpr.level ASC NULLS LAST, p.end_date ASC NULLS LAST
    `);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    type Bucket = "overdue" | "urgent" | "soon" | "ongoing" | "no_date";
    type Row = { p: Project; bucket: Bucket; diff: number };

    const buckets: Record<Bucket, Row[]> = {
      overdue: [], urgent: [], soon: [], ongoing: [], no_date: [],
    };

    for (const p of rows) {
      if (!p.end_date) {
        buckets.no_date.push({ p, bucket: "no_date", diff: 0 });
        continue;
      }
      const end  = new Date(p.end_date);
      const diff = differenceInCalendarDays(end, today);
      if (diff < 0)        buckets.overdue.push({ p, bucket: "overdue", diff });
      else if (diff <= 3)  buckets.urgent.push ({ p, bucket: "urgent",  diff });
      else if (diff <= 7)  buckets.soon.push   ({ p, bucket: "soon",    diff });
      else                 buckets.ongoing.push ({ p, bucket: "ongoing", diff });
    }

    const total = rows.length;
    const dateStr = format(today, "EEEE, d MMMM yyyy", { locale: localeId });

    const lines: string[] = [
      `*📋 Project Daily Briefing*`,
      `_${dateStr}_`,
      ``,
      `📊 *Ringkasan:* ${total} project aktif  •  🔴 ${buckets.overdue.length} overdue  •  🚨 ${buckets.urgent.length} urgent  •  ✅ ${buckets.ongoing.length + buckets.soon.length} ongoing`,
    ];

    // ── Overdue ──────────────────────────────────────────────────────────────
    if (buckets.overdue.length > 0) {
      lines.push(``, `*🔴 OVERDUE — ${buckets.overdue.length} project*`);
      for (const { p, diff } of buckets.overdue) {
        const end = format(new Date(p.end_date!), "d MMM yyyy");
        lines.push(fmt(p, `Terlambat *${Math.abs(diff)} hari*  (deadline: ${end})`));
      }
    }

    // ── Urgent ───────────────────────────────────────────────────────────────
    if (buckets.urgent.length > 0) {
      lines.push(``, `*🚨 URGENT — Deadline dalam 1–3 Hari (${buckets.urgent.length} project)*`);
      for (const { p, diff } of buckets.urgent) {
        const end = format(new Date(p.end_date!), "d MMM yyyy");
        const sisa = diff === 0 ? "Hari ini!" : `${diff} hari lagi`;
        lines.push(fmt(p, `*${sisa}*  (deadline: ${end})`));
      }
    }

    // ── Soon ─────────────────────────────────────────────────────────────────
    if (buckets.soon.length > 0) {
      lines.push(``, `*⏰ HAMPIR JATUH TEMPO — 4–7 Hari Lagi (${buckets.soon.length} project)*`);
      for (const { p, diff } of buckets.soon) {
        const end = format(new Date(p.end_date!), "d MMM yyyy");
        lines.push(fmt(p, `${diff} hari lagi  (deadline: ${end})`));
      }
    }

    // ── Ongoing ──────────────────────────────────────────────────────────────
    if (buckets.ongoing.length > 0) {
      lines.push(``, `*🏗️ ONGOING — ${buckets.ongoing.length} project*`);
      // Group by range to keep message readable
      const ranges: { label: string; max: number; rows: Row[] }[] = [
        { label: "8–14 hari", max: 14,  rows: [] },
        { label: "15–30 hari", max: 30, rows: [] },
        { label: "31–60 hari", max: 60, rows: [] },
        { label: "> 60 hari",  max: Infinity, rows: [] },
      ];
      for (const row of buckets.ongoing) {
        const range = ranges.find(r => row.diff <= r.max)!;
        range.rows.push(row);
      }
      for (const { label, rows: rr } of ranges) {
        if (rr.length === 0) continue;
        lines.push(`  _${label} (${rr.length}):_`);
        for (const { p, diff } of rr) {
          const end = format(new Date(p.end_date!), "d MMM yyyy");
          lines.push(fmt(p, `${diff} hari lagi  (deadline: ${end})`));
        }
      }
    }

    // ── No date ──────────────────────────────────────────────────────────────
    if (buckets.no_date.length > 0) {
      lines.push(``, `*❓ BELUM ADA DEADLINE — ${buckets.no_date.length} project*`);
      for (const { p } of buckets.no_date) {
        const pct = Math.round(Number(p.overall_progress_pct ?? 0));
        lines.push(`⚪ ${p.project_name}  •  ${pct}%  •  Phase: ${p.current_phase_name ?? "—"}`);
      }
    }

    lines.push(``, `_Cek detail: http://192.168.10.68:3000/dashboard/alerts_`);

    const message = lines.join("\n");

    // GChat webhooks have a ~4000-char soft limit — truncate gracefully
    const MAX = 3800;
    const finalMsg = message.length > MAX
      ? message.slice(0, MAX) + `\n…_(pesan dipotong — total ${total} project)_`
      : message;

    await sendNotification(finalMsg);
    console.log(`[alert-notify] Sent daily briefing: ${total} projects`);
    return { sent: true, total, message: finalMsg };
  } catch (err) {
    console.error("[alert-notify] Error:", err);
    throw err;
  } finally {
    client?.release();
  }
}
