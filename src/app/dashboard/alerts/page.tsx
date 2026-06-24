"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { differenceInCalendarDays, format, formatDistanceToNow } from "date-fns";
import { ShieldAlert, AlertTriangle, Clock, Sparkles, ArrowRight, Search } from "lucide-react";

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
  { key: "new",     label: "New Projects",  icon: Sparkles,      color: "text-teal-500",   emptyLabel: "No new projects recently" },
  { key: "soon",    label: "Due in 7 days", icon: Clock,         color: "text-amber-500",  emptyLabel: "Nothing due in 7 days" },
  { key: "urgent",  label: "Due in 3 days", icon: Clock,         color: "text-orange-500", emptyLabel: "Nothing due in 3 days" },
  { key: "overdue", label: "Overdue",       icon: AlertTriangle, color: "text-red-500",    emptyLabel: "No overdue projects" },
];

function buildAlerts(projects: Project[]): AlertItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const alerts: AlertItem[] = [];

  for (const p of projects) {
    const progress = Number(p.overall_progress_pct ?? 0);
    const endDate  = p.end_date ? new Date(p.end_date) : null;

    // Deadline alerts (mutually exclusive by severity)
    if (endDate && progress < 100) {
      if (endDate < today) {
        alerts.push({ project: p, category: "overdue", daysOverdue: differenceInCalendarDays(today, endDate) });
      } else {
        const daysLeft = differenceInCalendarDays(endDate, today);
        if (daysLeft <= 3) alerts.push({ project: p, category: "urgent", daysLeft });
        else if (daysLeft <= 7) alerts.push({ project: p, category: "soon", daysLeft });
      }
    }

    // New projects — independent from deadline alerts, only for in-progress projects
    if (p.created_at && progress < 100) {
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
      className={`group flex items-center gap-4 px-4 py-3.5 rounded-lg border cursor-pointer transition-all hover:shadow-sm ${badge.bg} ${badge.border}`}
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
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return (["all", "overdue", "urgent", "soon", "new"].includes(t ?? "") ? t : "all") as Tab;
  });
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const res  = await fetch("/api/projects/gantt", { cache: "no-store" });
      const json = await res.json();
      if (json.success) setProjects(json.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const alerts   = buildAlerts(projects);
  const byTab = tab === "all"
    ? [...new Map(alerts.map(a => [a.project.id + a.category, a])).values()]
    : alerts.filter(a => a.category === tab);
  const filtered = search.trim()
    ? byTab.filter(a => [a.project.project_name, a.project.project_code, a.project.unit_code, a.project.current_phase_name]
        .join(" ").toLowerCase().includes(search.toLowerCase()))
    : byTab;

  const counts = {
    overdue: alerts.filter(a => a.category === "overdue").length,
    urgent:  alerts.filter(a => a.category === "urgent").length,
    soon:    alerts.filter(a => a.category === "soon").length,
    new:     alerts.filter(a => a.category === "new").length,
  };
  const allCount = new Set(alerts.map(a => a.project.id)).size;
  return (
    <div className="space-y-4 pb-6 animate-page-enter">

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 mt-2">
        <ShieldAlert size={16} className="text-red-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Live Alerts</h2>
      </div>



      {/* Tab filter */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100/80 dark:bg-white/6 border border-slate-200/60 dark:border-white/8 flex-wrap">
        {TAB_CONFIG.map(({ key, label, icon: Icon, color }) => {
          const count = key === "all" ? allCount : counts[key as AlertCategory] ?? 0;
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

      {/* Search */}
      <label className="relative block w-full max-w-sm">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search project, unit, phase..."
          className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white"
        />
      </label>

      {/* Alert list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/6 flex items-center justify-center">
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
