"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays, format, formatDistanceToNow } from "date-fns";
import { ShieldAlert, AlertTriangle, Clock, Sparkles, ArrowRight, RefreshCw } from "lucide-react";

type Project = {
  id: string;
  project_name: string;
  project_code: string;
  unit_code: string | null;
  end_date: string | null;
  created_at: string | null;
  overall_progress_pct: string | null;
  current_phase_name: string | null;
  priority_name: string | null;
  priority_code: string | null;
  priority_color: string | null;
  status_label: string | null;
};

type AlertCategory = "overdue" | "soon" | "urgent" | "new";
type Tab = "all" | AlertCategory;

type AlertItem = {
  project: Project;
  category: AlertCategory;
  daysOverdue?: number;   // overdue: positive = days past
  daysLeft?: number;      // near deadline: days remaining
  createdAgo?: string;    // new: human-readable
};

const PRIORITY_CONFIG: Record<string, { color: string; dot: string }> = {
  CRITICAL: { color: "#ef4444", dot: "bg-red-500" },
  HIGH:     { color: "#f97316", dot: "bg-orange-500" },
  MID:      { color: "#eab308", dot: "bg-yellow-500" },
  LOW:      { color: "#22c55e", dot: "bg-green-500" },
};

const TAB_CONFIG: { key: Tab; label: string; icon: React.ElementType; color: string; emptyLabel: string }[] = [
  { key: "all",     label: "All",           icon: ShieldAlert,   color: "text-slate-500",  emptyLabel: "No alerts right now" },
  { key: "overdue", label: "Overdue",       icon: AlertTriangle, color: "text-red-500",    emptyLabel: "No overdue projects" },
  { key: "urgent",  label: "Due in 3 days", icon: Clock,         color: "text-orange-500", emptyLabel: "Nothing due in 3 days" },
  { key: "soon",    label: "Due in 7 days", icon: Clock,         color: "text-amber-500",  emptyLabel: "Nothing due in 7 days" },
  { key: "new",     label: "New Projects",  icon: Sparkles,      color: "text-teal-500",   emptyLabel: "No new projects recently" },
];

function buildAlerts(projects: Project[]): AlertItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts: AlertItem[] = [];

  for (const p of projects) {
    const progress = Number(p.overall_progress_pct ?? 0);
    const endDate  = p.end_date ? new Date(p.end_date) : null;

    // Overdue
    if (endDate && endDate < today && progress < 100) {
      alerts.push({ project: p, category: "overdue", daysOverdue: differenceInCalendarDays(today, endDate) });
      continue;
    }

    // Near deadline
    if (endDate && endDate >= today && progress < 100) {
      const daysLeft = differenceInCalendarDays(endDate, today);
      if (daysLeft <= 3) {
        alerts.push({ project: p, category: "urgent", daysLeft });
        continue;
      }
      if (daysLeft <= 7) {
        alerts.push({ project: p, category: "soon", daysLeft });
        continue;
      }
    }

    // New (created within last 7 days)
    if (p.created_at) {
      const created = new Date(p.created_at);
      if (differenceInCalendarDays(today, created) <= 7) {
        alerts.push({ project: p, category: "new", createdAgo: formatDistanceToNow(created, { addSuffix: true }) });
      }
    }
  }

  // Sort: overdue (most days first) → urgent → soon → new (most recent first)
  const ORDER: AlertCategory[] = ["overdue", "urgent", "soon", "new"];
  alerts.sort((a, b) => {
    const oi = ORDER.indexOf(a.category) - ORDER.indexOf(b.category);
    if (oi !== 0) return oi;
    if (a.category === "overdue") return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
    if (a.category === "urgent" || a.category === "soon") return (a.daysLeft ?? 999) - (b.daysLeft ?? 999);
    return 0;
  });

  return alerts;
}

function AlertCard({ item, onClick }: { item: AlertItem; onClick: () => void }) {
  const { project: p, category, daysOverdue, daysLeft, createdAgo } = item;
  const pCfg = PRIORITY_CONFIG[p.priority_code ?? ""] ?? { color: "#94a3b8", dot: "bg-slate-400" };

  const badge = {
    overdue: { bg: "bg-red-50 dark:bg-red-500/10",    text: "text-red-600 dark:text-red-400",    border: "border-red-200/60 dark:border-red-500/20", icon: <AlertTriangle size={11} />, label: `Overdue ${daysOverdue}d` },
    urgent:  { bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-200/60 dark:border-orange-500/20", icon: <Clock size={11} />, label: `Due in ${daysLeft}d` },
    soon:    { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200/60 dark:border-amber-500/20", icon: <Clock size={11} />, label: `Due in ${daysLeft}d` },
    new:     { bg: "bg-teal-50 dark:bg-teal-500/10",  text: "text-teal-600 dark:text-teal-400",  border: "border-teal-200/60 dark:border-teal-500/20",  icon: <Sparkles size={11} />, label: "New" },
  }[category];

  const progress = Number(p.overall_progress_pct ?? 0);

  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-4 px-4 py-3.5 rounded-xl border cursor-pointer transition-all hover:shadow-sm ${badge.bg} ${badge.border}`}
    >
      {/* Priority dot */}
      <span className={`w-2 h-2 rounded-full shrink-0 ${pCfg.dot}`} />

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pCfg.color }}>
            {p.priority_name ?? "–"}
          </span>
          {p.unit_code && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.unit_code}</span>
          )}
        </div>
        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate leading-snug">
          {p.unit_code
            ? p.project_name.split(" - ").slice(1).join(" - ") || p.project_name
            : p.project_name}
        </p>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {p.current_phase_name && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.current_phase_name}</span>
          )}
          {category !== "new" && (
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1 rounded-full bg-slate-200/70 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, progress)}%`,
                    backgroundColor: progress >= 75 ? "#22c55e" : progress >= 40 ? "#f59e0b" : "#ef4444",
                  }}
                />
              </div>
              <span className="text-[10px] text-slate-400">{progress.toFixed(0)}%</span>
            </div>
          )}
          {category === "new" && p.created_at && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Created {createdAgo}</span>
          )}
          {(category === "overdue" || category === "urgent" || category === "soon") && p.end_date && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              End: {format(new Date(p.end_date), "dd MMM yyyy")}
            </span>
          )}
        </div>
      </div>

      {/* Alert badge */}
      <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${badge.text}`}>
        {badge.icon}
        {badge.label}
      </div>

      <ArrowRight size={13} className="text-slate-300 dark:text-slate-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
    </div>
  );
}

export default function AlertsPage() {
  const router = useRouter();
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab]               = useState<Tab>("all");

  const load = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res  = await fetch("/api/projects/gantt", { cache: "no-store" });
      const json = await res.json();
      if (json.success) { setProjects(json.data); setLastUpdated(new Date()); }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const alerts   = buildAlerts(projects);
  const filtered = tab === "all" ? alerts : alerts.filter(a => a.category === tab);

  const counts = {
    overdue: alerts.filter(a => a.category === "overdue").length,
    urgent:  alerts.filter(a => a.category === "urgent").length,
    soon:    alerts.filter(a => a.category === "soon").length,
    new:     alerts.filter(a => a.category === "new").length,
  };
  const totalAlerts = counts.overdue + counts.urgent + counts.soon;

  return (
    <div className="space-y-4 pb-6 animate-page-enter">

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 mt-2 justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Live Alerts</h2>
          {totalAlerts > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
              {totalAlerts}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          {lastUpdated && <span>Updated {format(lastUpdated, "HH:mm:ss")}</span>}
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={11} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Overdue",       count: counts.overdue, bg: "bg-red-50 dark:bg-red-500/10",    text: "text-red-600 dark:text-red-400",    border: "border-red-200/60 dark:border-red-500/20",    icon: <AlertTriangle size={14} /> },
            { label: "Due in 3 days", count: counts.urgent,  bg: "bg-orange-50 dark:bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-200/60 dark:border-orange-500/20", icon: <Clock size={14} /> },
            { label: "Due in 7 days", count: counts.soon,    bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-200/60 dark:border-amber-500/20",  icon: <Clock size={14} /> },
            { label: "New Projects",  count: counts.new,     bg: "bg-teal-50 dark:bg-teal-500/10",  text: "text-teal-600 dark:text-teal-400",  border: "border-teal-200/60 dark:border-teal-500/20",   icon: <Sparkles size={14} /> },
          ].map(s => (
            <div key={s.label} className={`glass-card p-4 border ${s.bg} ${s.border}`}>
              <div className={`flex items-center gap-1.5 mb-1 ${s.text}`}>
                {s.icon}
                <span className="text-[10px] font-semibold uppercase tracking-wide">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold ${s.text}`}>{s.count}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab filter */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-white/6 border border-slate-200/60 dark:border-white/8 flex-wrap">
        {TAB_CONFIG.map(({ key, label, icon: Icon, color }) => {
          const count = key === "all" ? alerts.length : counts[key as AlertCategory] ?? 0;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                tab === key
                  ? "bg-white dark:bg-zinc-800 shadow-sm text-slate-800 dark:text-white"
                  : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              <Icon size={12} className={tab === key ? color : ""} />
              {label}
              {count > 0 && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab === key ? `${color} bg-current/10` : "bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alert list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-red-400/40 border-t-red-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/6 flex items-center justify-center">
            <ShieldAlert size={22} className="text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            {TAB_CONFIG.find(t => t.key === tab)?.emptyLabel ?? "No alerts"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <AlertCard
              key={`${item.category}-${item.project.id}`}
              item={item}
              onClick={() => router.push(`/dashboard/projects/${item.project.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
