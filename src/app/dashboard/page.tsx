"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, TrendingUp, Users,
  Loader2, Building2, Home, UserCircle2, Flag, CalendarDays,
} from "lucide-react";
import { Doughnut } from "react-chartjs-2";
import { DEFAULT_PHASE_COLOR, type CustomPhase } from "@/lib/phases";
import { usePhases } from "@/lib/usePhases";
import DateRangePicker, { DateRange } from "@/components/dashboard/DateRangePicker";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

type DBProject = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: number;
  start_date: string | null;
  end_date: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  status_label: string | null;
  status_color: string | null;
  priority_name: string | null;
  priority_color: string | null;
  priority_level: number | null;
  unit_code: string | null;
  unit_name: string | null;
  pm_end: string | null;
  handover_progress: number | null;
  brief_pic: string | null;
  design_pic: string | null;
  control_pic: string | null;
  pm_pic: string | null;
  handover_pic: string | null;
  /** Phases added via Master Setup beyond the built-in five. */
  extra_phases?: CustomPhase[] | null;
};

/** Resolves the PIC name for whichever phase a project is currently in. */
function currentPic(p: DBProject): string | null {
  const map: Record<string, string | null> = {
    operational_brief: p.brief_pic,
    design: p.design_pic,
    project_control: p.control_pic,
    project_management: p.pm_pic,
    handover: p.handover_pic,
  };
  return map[p.current_phase_code ?? ""] ?? p.pm_pic ?? null;
}

const PIC_AVATAR_COLORS = [
  "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400",
  "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400",
  "bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400",
  "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
  "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400",
];

function picInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("") || "?";
}

/** A phase column on the board — the built-in five plus any custom phases. */
type PhaseMeta = { code: string; label: string; color: string };

/** Kanban card for the Active Projects board — one per project, grouped by phase column. */
function KanbanCard({ p, phases, router }: { p: DBProject; phases: PhaseMeta[]; router: ReturnType<typeof useRouter> }) {
  const phaseIdx   = phases.findIndex(ph => ph.code === p.current_phase_code);
  const phaseNum   = phaseIdx >= 0 ? phaseIdx + 1 : 0;
  const phaseColor = phaseIdx >= 0 ? phases[phaseIdx].color : DEFAULT_PHASE_COLOR;
  const pic        = currentPic(p);
  const dueLabel   = p.end_date
    ? new Date(p.end_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <button
      onClick={() => router.push(`/dashboard/projects/${p.id}`)}
      className="w-full text-left p-4 rounded-2xl bg-white dark:bg-zinc-800/60 border border-slate-200/60 dark:border-white/8 card-hover"
    >
      {p.priority_name && (
        <div className="flex items-center gap-1 mb-2">
          <Flag size={11} style={{ color: p.priority_color || "#94a3b8" }} />
          <span className="text-[11px] font-bold" style={{ color: p.priority_color || "#94a3b8" }}>
            {p.priority_name}
          </span>
        </div>
      )}

      <p className="text-[13px] font-bold text-slate-800 dark:text-white leading-snug line-clamp-2 mb-3">
        {p.project_name}
      </p>

      <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
        <span>Progress</span>
        <span>{phaseNum || "–"}/{phases.length}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(phaseNum / Math.max(phases.length, 1)) * 100}%`, backgroundColor: phaseColor }} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
          <CalendarDays size={12} className="shrink-0" />
          {dueLabel ? (
            <span className="truncate">Due to: <span className="font-semibold text-slate-700 dark:text-slate-200">{dueLabel}</span></span>
          ) : (
            <span className="italic text-slate-400 dark:text-slate-500">No due date</span>
          )}
        </div>
        {pic && (
          <div
            title={pic}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${PIC_AVATAR_COLORS[pic.charCodeAt(0) % PIC_AVATAR_COLORS.length]}`}
          >
            {picInitials(pic)}
          </div>
        )}
      </div>
    </button>
  );
}

export default function DashboardHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [barMounted, setBarMounted] = useState(false);
  const [donutHover, setDonutHover] = useState<{ label: string; count: number; color: string } | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [stakeholderCount, setStakeholderCount] = useState(0);
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" });
  const { phases: dbPhases } = usePhases();

  const fetchDashboardData = useCallback(async () => {
    try {
      const [projectsRes, usersRes, peopleRes] = await Promise.all([
        fetch("/api/projects/gantt", { cache: "no-store" }),
        fetch("/api/master/users", { cache: "no-store" }),
        fetch("/api/master/people", { cache: "no-store" }),
      ]);

      const projectsData = projectsRes.ok ? await projectsRes.json() : { success: false };
      const usersData    = usersRes.ok    ? await usersRes.json()    : { success: false };
      const peopleData   = peopleRes.ok   ? await peopleRes.json()   : { success: false };

      if (projectsData.success) {
        setProjects(projectsData.data);
      }
      if (usersData.success) {
        setUserCount(usersData.data.length);
      }
      if (peopleData.success) {
        setStakeholderCount(peopleData.data.length);
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
      setTimeout(() => setBarMounted(true), 50);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const todayMidnight = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  /**
   * The phase pipeline as configured in Master Setup — order and color are
   * DB-driven, so dragging a phase or recoloring it there is reflected here.
   */
  const allPhases = useMemo<PhaseMeta[]>(
    () => dbPhases.map(p => ({ code: p.code, label: p.label, color: p.color })),
    [dbPhases]
  );

  const rangeFilteredProjects = useMemo(() => {
    if (!dateRange.start && !dateRange.end) return projects;
    const rs = dateRange.start ? new Date(dateRange.start) : null;
    const re = dateRange.end   ? new Date(dateRange.end)   : null;
    return projects.filter((p) => {
      const s = p.start_date ? new Date(p.start_date) : null;
      const e = p.end_date   ? new Date(p.end_date)   : null;
      if (rs && e && e < rs) return false;
      if (re && s && s > re) return false;
      return true;
    });
  }, [projects, dateRange]);

  const activeProjects = useMemo(
    () => rangeFilteredProjects.filter((p) => (p.overall_progress_pct ?? 0) < 100),
    [rangeFilteredProjects]
  );

  const overdueProjects = useMemo(
    () => activeProjects.filter((p) => (p.end_date ? new Date(p.end_date) < todayMidnight : false)),
    [activeProjects, todayMidnight]
  );

  const completedProjects = useMemo(
    () =>
      rangeFilteredProjects
        .filter((p) => (p.overall_progress_pct ?? 0) >= 100)
        .sort((a, b) => (b.overall_progress_pct ?? 0) - (a.overall_progress_pct ?? 0)),
    [rangeFilteredProjects]
  );

  const uniqueUnits = useMemo(
    () => [...new Set(rangeFilteredProjects.map((p) => p.unit_code).filter(Boolean))],
    [rangeFilteredProjects]
  );

  /** Counts per phase, over the full phase list (built-in + custom). */
  const phaseDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of activeProjects) {
      const code = p.current_phase_code ?? "";
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
    const rows = allPhases
      .map(ph => ({ name: ph.label, count: counts.get(ph.code) ?? 0, color: ph.color }))
      .filter(r => r.count > 0);

    // Anything whose phase code isn't in the known list (e.g. a phase deleted
    // while projects still point at it) collapses into one "Other" row.
    const knownCodes = new Set(allPhases.map(ph => ph.code));
    const otherCount = [...counts.entries()]
      .filter(([code]) => !knownCodes.has(code))
      .reduce((sum, [, n]) => sum + n, 0);
    if (otherCount > 0) rows.push({ name: "Other", count: otherCount, color: DEFAULT_PHASE_COLOR });

    const max = Math.max(...rows.map(r => r.count), 1);
    return rows.map(r => ({ ...r, pct: Math.round((r.count / max) * 100) }));
  }, [activeProjects, allPhases]);

  /** Active Projects board — one column per phase, in pipeline order. */
  const phaseColumns = useMemo(() => {
    const buckets = allPhases.map(ph => ({ ...ph, projects: [] as DBProject[] }));
    const other: DBProject[] = [];
    for (const p of activeProjects) {
      const idx = allPhases.findIndex(ph => ph.code === p.current_phase_code);
      if (idx >= 0) buckets[idx].projects.push(p);
      else other.push(p);
    }
    return other.length > 0
      ? [...buckets, { code: "other", label: "Other", color: DEFAULT_PHASE_COLOR, projects: other }]
      : buckets;
  }, [activeProjects, allPhases]);

  // Three states, three distinct meanings: done (green), failing (red),
  // in-flight (purple). "On Track" used to be a second green — only ΔE 6.3
  // from Completed, so even full-color-vision readers couldn't separate the
  // two arcs. Purple is deliberately outside both PHASE_COLORS and
  // CUSTOM_PHASE_PALETTE so this status can never be mistaken for a phase in
  // the Phase Distribution chart beside it.
  const DONUT_ITEMS = [
    { label: "Completed", color: "#22c55e", onClick: () => router.push("/dashboard/projects/list?tab=completed") },
    { label: "Overdue",   color: "#ef4444", onClick: () => router.push("/dashboard/alerts?tab=overdue") },
    { label: "On Track",  color: "#a855f7", onClick: () => router.push("/dashboard/projects/list") },
  ] as const;

  const donutData = useMemo(() => {
    const onTrack = Math.max(0, activeProjects.length - overdueProjects.length);
    return {
      labels: DONUT_ITEMS.map(i => i.label),
      datasets: [{
        data: [completedProjects.length, overdueProjects.length, onTrack],
        backgroundColor: DONUT_ITEMS.map(i => i.color),
        borderColor: "transparent",
        borderWidth: 0,
        hoverOffset: 14,
        borderRadius: 5,
        spacing: 4,
      }],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjects, overdueProjects, completedProjects]);

  const donutCounts = useMemo(
    () => [completedProjects.length, overdueProjects.length, Math.max(0, activeProjects.length - overdueProjects.length)],
    [completedProjects.length, overdueProjects.length, activeProjects.length]
  );

  const donutChartOptions = useMemo(() => ({
    maintainAspectRatio: true,
    cutout: "72%",
    animation: { animateRotate: true, animateScale: false, duration: 700 },
    layout: { padding: 18 },
    onClick: (_e: unknown, elements: { index: number }[]) => {
      if (!elements.length) return;
      DONUT_ITEMS[elements[0].index]?.onClick();
    },
    onHover: (_e: unknown, elements: { index: number }[]) => {
      if (!elements.length) { setDonutHover(prev => prev === null ? null : null); return; }
      const idx = elements[0].index;
      setDonutHover(prev =>
        prev?.label === DONUT_ITEMS[idx].label && prev?.count === donutCounts[idx]
          ? prev
          : { label: DONUT_ITEMS[idx].label, count: donutCounts[idx], color: DONUT_ITEMS[idx].color }
      );
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [donutCounts]);

  const STATS = [
    { label: "Active",    value: activeProjects.length,    icon: TrendingUp,   accent: "text-emerald-600 dark:text-emerald-400", path: "/dashboard/projects/list" },
    { label: "Completed", value: completedProjects.length, icon: CheckCircle2, accent: "text-green-600 dark:text-green-400",     path: "/dashboard/projects/list?tab=completed" },
    { label: "Overdue",   value: overdueProjects.length,   icon: AlertTriangle, accent: "text-red-600 dark:text-red-400",        path: "/dashboard/alerts?tab=overdue" },
    { label: "Units",     value: uniqueUnits.length,       icon: Building2,    accent: "text-teal-600 dark:text-teal-400",       path: "/dashboard/team?tab=units" },
    { label: "PIC",       value: userCount,                icon: UserCircle2,  accent: "text-violet-600 dark:text-violet-400",   path: "/dashboard/team?tab=users" },
    { label: "Stakeholders", value: stakeholderCount,      icon: Users,        accent: "text-sky-600 dark:text-sky-400",         path: "/dashboard/team?tab=stakeholders" },
  ];

  return (
    <div className="space-y-6 pb-6 animate-page-enter">

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-1 mt-2">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-emerald-500" />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Dashboard Overview</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
          {loading && (
            <span className="text-blue-500 flex items-center gap-1.5 font-medium text-[11px]">
              <Loader2 size={11} className="animate-spin" /> Loading...
            </span>
          )}
        </div>
      </div>

      {/* ── Compact stat row ──────────────────────────────────────────────── */}
      <section className="glass-card p-2 flex flex-wrap sm:flex-nowrap divide-x divide-slate-200/60 dark:divide-white/8">
        {STATS.map(({ label, value, icon: Icon, accent, path }) => (
          <button
            key={label}
            onClick={() => router.push(path)}
            className="flex-1 min-w-24 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-left"
          >
            <Icon size={15} className={`shrink-0 ${accent}`} />
            <div className="min-w-0">
              <p className="text-base font-black text-slate-800 dark:text-white leading-none">
                {loading ? "—" : value}
              </p>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate mt-0.5">{label}</p>
            </div>
          </button>
        ))}
      </section>

      {/* Two panels */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Overall Performance */}
        <section className="glass-card p-5">
          <div className="section-title">
            <h3>Status Snapshot</h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Chart with center text overlay */}
            <div className="relative w-56 h-56 shrink-0 cursor-pointer">
              {rangeFilteredProjects.length > 0 ? (
                <>
                  <Doughnut
                    data={donutData}
                    options={donutChartOptions}
                  />
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none transition-all duration-200">
                    {donutHover ? (
                      <>
                        <span className="text-3xl font-black leading-none transition-all duration-200" style={{ color: donutHover.color }}>{donutHover.count}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] mt-1 transition-all duration-200" style={{ color: donutHover.color }}>{donutHover.label}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-black text-slate-800 dark:text-white leading-none">{rangeFilteredProjects.length}</span>
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-1">Projects</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">No data available.</p>
              )}
            </div>

            {/* Legend cards */}
            <div className="flex flex-col gap-2.5 flex-1 w-full">
              {DONUT_ITEMS.map((item, i) => {
                const counts = [completedProjects.length, overdueProjects.length, Math.max(0, activeProjects.length - overdueProjects.length)];
                const count = counts[i];
                const pct = rangeFilteredProjects.length > 0 ? Math.round((count / rangeFilteredProjects.length) * 100) : 0;
                return (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold" style={{ color: item.color }}>{count}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: barMounted ? `${pct}%` : "0%", backgroundColor: item.color, opacity: 0.85 }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Total</span>
                <span className="text-sm font-black text-slate-700 dark:text-slate-200">{rangeFilteredProjects.length} projects</span>
              </div>
            </div>
          </div>
        </section>

        {/* Phase Distribution */}
        <section className="glass-card p-5">
          <div className="section-title">
            <h3>Phase Distribution</h3>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
            </div>
          ) : phaseDistribution.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-12">No active projects.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {phaseDistribution.map(({ name, count, pct, color }) => (
                <div key={name}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold" style={{ color }}>{count}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 w-12 text-right">
                        {activeProjects.length > 0 ? Math.round((count / activeProjects.length) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-white/8 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: barMounted ? `${pct}%` : "0%", backgroundColor: color, opacity: 0.85 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Active Projects board — one column per phase, cards carry priority/phase-progress/due/PIC */}
      <section className="glass-card p-5">
        <div className="section-title">
          <h3>Active Projects</h3>
        </div>
        {activeProjects.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No active projects.</p>
        ) : (
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-4 min-w-min">
              {phaseColumns.map((col) => (
                <div key={col.code} className="w-72 shrink-0 flex flex-col">
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <h4 className="text-[12px] font-bold text-slate-700 dark:text-slate-200 flex-1 truncate">{col.label}</h4>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400 shrink-0">
                      {col.projects.length}
                    </span>
                  </div>
                  <div className="space-y-3 max-h-140 overflow-y-auto pr-1 scrollbar-border">
                    {col.projects.length === 0 ? (
                      <p className="text-[11px] text-slate-300 dark:text-slate-600 italic px-1">No projects</p>
                    ) : (
                      col.projects.map((p) => <KanbanCard key={p.id} p={p} phases={allPhases} router={router} />)
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
