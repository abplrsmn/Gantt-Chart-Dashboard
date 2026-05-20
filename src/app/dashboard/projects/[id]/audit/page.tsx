"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { id as localeId } from "date-fns/locale";
import {
  ArrowLeft, Clock, FilePlus, Pencil, CheckCircle2,
  CalendarClock, Zap, RefreshCw, ChevronLeft, ChevronRight,
  Inbox,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type ActionType =
  | "project_created"
  | "project_updated"
  | "field_updated"
  | "phase_updated"
  | "phase_progressed"
  | "progress_updated"
  | "phase_approved"
  | "deadline_delayed"
  | "deadline_accelerated"
  | "attachment_added"
  | "create"
  | "update";

type AuditLog = {
  id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  change_summary: string | null;
  changed_by_name: string | null;
  action_type: string;
  created_at: string;
};

type Meta = { page: number; limit: number; total: number; pages: number };

// ─── Config per action type ───────────────────────────────────────────────────
const ACTION_CONFIG: Record<
  ActionType,
  { label: string; color: string; bg: string; border: string; Icon: React.ElementType }
> = {
  project_created: {
    label: "Project Created",
    color: "#22c55e",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
    Icon: FilePlus,
  },
  project_updated: {
    label: "Project Updated",
    color: "#3b82f6",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
    Icon: RefreshCw,
  },
  field_updated: {
    label: "Field Updated",
    color: "#3b82f6",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
    Icon: Pencil,
  },
  phase_updated: {
    label: "Phase Updated",
    color: "#06b6d4",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
    border: "border-cyan-200 dark:border-cyan-500/30",
    Icon: RefreshCw,
  },
  phase_progressed: {
    label: "Phase Progressed",
    color: "#14b8a6",
    bg: "bg-teal-50 dark:bg-teal-500/10",
    border: "border-teal-200 dark:border-teal-500/30",
    Icon: CheckCircle2,
  },
  progress_updated: {
    label: "Progress Updated",
    color: "#14b8a6",
    bg: "bg-teal-50 dark:bg-teal-500/10",
    border: "border-teal-200 dark:border-teal-500/30",
    Icon: Pencil,
  },
  phase_approved: {
    label: "Phase Approved",
    color: "#8b5cf6",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/30",
    Icon: CheckCircle2,
  },
  deadline_delayed: {
    label: "Deadline Delayed",
    color: "#ef4444",
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/30",
    Icon: CalendarClock,
  },
  deadline_accelerated: {
    label: "Deadline Moved Up",
    color: "#f59e0b",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
    Icon: Zap,
  },
  attachment_added: {
    label: "Attachment Added",
    color: "#8b5cf6",
    bg: "bg-violet-50 dark:bg-violet-500/10",
    border: "border-violet-200 dark:border-violet-500/30",
    Icon: FilePlus,
  },
  create: {
    label: "Project Created",
    color: "#22c55e",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
    Icon: FilePlus,
  },
  update: {
    label: "Field Updated",
    color: "#3b82f6",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
    Icon: Pencil,
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtTimestamp(iso: string) {
  const d = new Date(iso);
  return {
    full:     format(d, "dd MMM yyyy, HH:mm"),
    relative: formatDistanceToNow(d, { addSuffix: true, locale: localeId }),
  };
}

function avatarInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
}

function getActionConfig(type: string | null | undefined) {
  return ACTION_CONFIG[(type ?? "") as ActionType] ?? ACTION_CONFIG.field_updated;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function ActionBadge({ type }: { type: string }) {
  const cfg = getActionConfig(type);
  const { Icon } = cfg;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border}`}
      style={{ color: cfg.color }}
    >
      <Icon size={9} />
      {cfg.label}
    </span>
  );
}

function LogEntry({ log }: { log: AuditLog }) {
  const cfg = getActionConfig(log.action_type);
  const { Icon } = cfg;
  const ts = fmtTimestamp(log.created_at);

  const hasChange = log.old_value || log.new_value;

  return (
    <div className="flex gap-3.5">
      {/* Icon column */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center border shadow-sm"
          style={{ backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}40` }}
        >
          <Icon size={14} style={{ color: cfg.color }} />
        </div>
        <div className="w-px flex-1 mt-1.5 bg-slate-200/60 dark:bg-white/8" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-5 min-w-0">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          {/* Avatar + name */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ backgroundColor: cfg.color }}
            >
              {avatarInitials(log.changed_by_name)}
            </span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {log.changed_by_name ?? "System"}
            </span>
          </div>
          <ActionBadge type={log.action_type} />
          <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500 shrink-0" title={ts.full}>
            {ts.relative}
          </span>
        </div>

        {/* Summary */}
        {log.change_summary && (
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-2 leading-relaxed">
            {log.change_summary}
          </p>
        )}

        {/* Old → New values */}
        {hasChange && (
          <div className="flex items-stretch gap-2 text-[11px]">
            {log.old_value && (
              <div className="flex-1 min-w-0 rounded-lg border border-red-200/60 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-red-400 mb-0.5">Before</p>
                <p className="text-slate-600 dark:text-slate-300 truncate font-mono">{log.old_value}</p>
              </div>
            )}
            {log.old_value && log.new_value && (
              <div className="self-center text-slate-400">→</div>
            )}
            {log.new_value && (
              <div className="flex-1 min-w-0 rounded-lg border border-emerald-200/60 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 px-2.5 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-500 mb-0.5">After</p>
                <p className="text-slate-600 dark:text-slate-300 truncate font-mono">{log.new_value}</p>
              </div>
            )}
          </div>
        )}

        {/* Field name tag */}
        {log.field_name && (
          <p className="mt-1.5 text-[10px] text-slate-400">
            Field:{" "}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 font-mono">
              {log.field_name}
            </code>
          </p>
        )}

        {/* Full timestamp on hover */}
        <p className="mt-1.5 text-[10px] text-slate-400 flex items-center gap-1">
          <Clock size={9} />
          {ts.full}
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AuditLogPage() {
  const router  = useRouter();
  const params  = useParams();
  const id      = params?.id as string;

  const [logs,    setLogs]    = useState<AuditLog[]>([]);
  const [meta,    setMeta]    = useState<Meta>({ page: 1, limit: 50, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [page,    setPage]    = useState(1);

  const fetchLogs = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: "50" });
      const res  = await fetch(`/api/projects/${id}/audit?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        setMeta(json.meta);
      }
    } finally {
      setLoading(false);
    }
  }, [id, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4 pb-10 animate-page-enter">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Go Back
        </button>
        <div className="flex-1 min-w-0" />
        <button
          onClick={fetchLogs}
          className="p-2 rounded-xl bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm shrink-0"
          title="Refresh"
        >
          <RefreshCw size={13} className={`text-slate-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Log timeline ── */}
      <div className="glass-card px-4 pt-4 pb-1">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/8 flex items-center justify-center">
              <Inbox size={20} className="text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No logs yet</p>
            <p className="text-xs text-slate-400 max-w-xs">
              No changes have been recorded for this project yet.
            </p>
          </div>
        ) : (
          <div>
            {logs.map((log, i) => (
              <div key={log.id} style={{ opacity: 1 }}>
                {/* Date separator */}
                {(i === 0 || !isSameDay(log.created_at, logs[i - 1].created_at)) && (
                  <div className="flex items-center gap-2 mb-3 mt-1">
                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/8" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2">
                      {format(new Date(log.created_at), "dd MMMM yyyy", { locale: localeId })}
                    </span>
                    <div className="flex-1 h-px bg-slate-200/60 dark:bg-white/8" />
                  </div>
                )}
                <LogEntry log={log} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {meta.pages > 1 && (
        <div className="glass-card px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-slate-400">
            Page {meta.page} of {meta.pages} · {meta.total} total
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="p-1.5 rounded-lg border border-slate-200/60 dark:border-white/10 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              disabled={page >= meta.pages}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg border border-slate-200/60 dark:border-white/10 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth()    === db.getMonth() &&
    da.getDate()     === db.getDate()
  );
}
