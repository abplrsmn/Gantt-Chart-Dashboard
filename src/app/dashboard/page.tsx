"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, CheckCircle2, TrendingUp, Users,
  Loader2, LayoutList, Building2, Home,
  Sparkles, UserCircle2, Layers,
} from "lucide-react";
import { Doughnut } from "react-chartjs-2";
import { PHASE_LIST, DEFAULT_PHASE_COLOR } from "@/lib/phases";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

const DAY_MS = 86_400_000;

type DBProject = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: number;
  start_date: string | null;
  end_date: string | null;
  current_phase_name: string | null;
  status_label: string | null;
  status_color: string | null;
  priority_name: string | null;
  priority_color: string | null;
  priority_level: number | null;
  unit_code: string | null;
  unit_name: string | null;
  pm_end: string | null;
  handover_progress: number | null;
};

export default function DashboardHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [barMounted, setBarMounted] = useState(false);
  const [donutHover, setDonutHover] = useState<{ label: string; count: number; color: string } | null>(null);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [userActiveCount, setUserActiveCount] = useState(0);
  const [stakeholderCount, setStakeholderCount] = useState(0);
  const [stakeholderActiveCount, setStakeholderActiveCount] = useState(0);

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
        setLastSynced(new Date());
      }
      if (usersData.success) {
        setUserCount(usersData.data.length);
        setUserActiveCount(usersData.data.filter((u: { is_active: boolean }) => u.is_active).length);
      }
      if (peopleData.success) {
        setStakeholderCount(peopleData.data.length);
        setStakeholderActiveCount(peopleData.data.filter((p: { is_active: boolean }) => p.is_active).length);
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

  const today = Date.now();

  const activeProjects = useMemo(
    () => projects.filter((p) => (p.overall_progress_pct ?? 0) < 95),
    [projects]
  );

  const overdueProjects = useMemo(
    () =>
      activeProjects.filter((p) => {
        const end = p.pm_end || p.end_date;
        return end ? new Date(end).getTime() < today : false;
      }),
    [activeProjects, today]
  );

  const urgentProjects = useMemo(
    () => activeProjects.filter((p) => {
      const end = p.end_date ? new Date(p.end_date).getTime() : null;
      if (!end) return false;
      const diff = end - today;
      return diff >= 0 && diff <= 3 * DAY_MS;
    }),
    [activeProjects, today]
  );

  const soonProjects = useMemo(
    () => activeProjects.filter((p) => {
      const end = p.end_date ? new Date(p.end_date).getTime() : null;
      if (!end) return false;
      const diff = end - today;
      return diff > 3 * DAY_MS && diff <= 7 * DAY_MS;
    }),
    [activeProjects, today]
  );

  const completedProjects = useMemo(
    () =>
      projects
        .filter((p) => (p.overall_progress_pct ?? 0) >= 95)
        .sort((a, b) => (b.overall_progress_pct ?? 0) - (a.overall_progress_pct ?? 0)),
    [projects]
  );

  const uniqueUnits = useMemo(
    () => [...new Set(projects.map((p) => p.unit_code).filter(Boolean))],
    [projects]
  );

  const phaseDistribution = useMemo(() => {
    const phaseMap = new Map<string, number>();
    for (const p of activeProjects) {
      const phase = p.current_phase_name || "Other";
      phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + 1);
    }
    const entries = [...phaseMap.entries()];
    entries.sort((a, b) => {
      const ai = PHASE_LIST.findIndex(ph => a[0].toLowerCase().includes(ph.shortLabel.toLowerCase()));
      const bi = PHASE_LIST.findIndex(ph => b[0].toLowerCase().includes(ph.shortLabel.toLowerCase()));
      if (ai === -1 && bi === -1) return b[1] - a[1];
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    const max = Math.max(...entries.map(e => e[1]), 1);
    return entries.map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / max) * 100),
      color: PHASE_LIST.find(ph => name.toLowerCase().includes(ph.shortLabel.toLowerCase()))?.color ?? DEFAULT_PHASE_COLOR,
    }));
  }, [activeProjects]);


  const DONUT_ITEMS = [
    { label: "Completed", color: "#22c55e", onClick: () => router.push("/dashboard/projects/list?tab=completed") },
    { label: "Overdue",   color: "#f43f5e", onClick: () => router.push("/dashboard/alerts?tab=overdue") },
    { label: "On Track",  color: "#6B3A2A", onClick: () => router.push("/dashboard/projects/list") },
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

  return (
    <div className="space-y-6 pb-6 animate-page-enter">

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 mt-2">
        <div className="flex items-center gap-2">
          <Home size={16} className="text-amber-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Dashboard Overview</h2>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          {loading ? (
            <span className="text-blue-500 flex items-center gap-1.5 font-medium">
              <Loader2 size={11} className="animate-spin" /> Loading...
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
              <CheckCircle2 size={11} className="text-green-500" />
              Synced {lastSynced?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div onClick={() => router.push("/dashboard/projects/list")} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? "..." : activeProjects.length}
            </span>
            <div className="p-2 rounded-lg" style={{ background: "rgba(59,35,21,0.08)", color: "var(--brand-mahogany)" }}>
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Projects</p>
        </div>

        <div onClick={() => router.push("/dashboard/projects/list?tab=completed")} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? "..." : completedProjects.length}
            </span>
            <div className="p-2 rounded-lg" style={{ background: "rgba(34,197,94,0.10)", color: "#22c55e" }}>
              <CheckCircle2 size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed Projects</p>
        </div>

        <div onClick={() => router.push("/dashboard/team?tab=units")} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? "..." : uniqueUnits.length}
            </span>
            <div className="p-2 rounded-lg" style={{ background: "rgba(196,149,106,0.15)", color: "var(--brand-sand)" }}>
              <Building2 size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Units</p>
        </div>
      </div>

      {/* Alert + People summary */}
      {!loading && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div onClick={() => router.push("/dashboard/alerts?tab=overdue")} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
              <div className="flex justify-between items-start mb-2">
                <span className="text-3xl font-bold text-slate-800 dark:text-white">{overdueProjects.length}</span>
                <div className="p-2 rounded-lg" style={{ background: "rgba(244,63,94,0.10)", color: "#f43f5e" }}>
                  <AlertTriangle size={18} />
                </div>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue</p>
            </div>
            <div onClick={() => router.push("/dashboard/team?tab=users")} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
              <div className="flex justify-between items-start mb-2">
                <span className="text-3xl font-bold text-slate-800 dark:text-white">{userCount}</span>
                <div className="p-2 rounded-lg" style={{ background: "rgba(139,92,246,0.10)", color: "#8b5cf6" }}>
                  <UserCircle2 size={18} />
                </div>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">PIC</p>
            </div>
            <div onClick={() => router.push("/dashboard/team?tab=stakeholders")} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
              <div className="flex justify-between items-start mb-2">
                <span className="text-3xl font-bold text-slate-800 dark:text-white">{stakeholderCount}</span>
                <div className="p-2 rounded-lg" style={{ background: "rgba(45,212,191,0.10)", color: "#2dd4bf" }}>
                  <Users size={18} />
                </div>
              </div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Stakeholders</p>
            </div>
          </div>
        </>
      )}

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
              {projects.length > 0 ? (
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
                        <span className="text-3xl font-black text-slate-800 dark:text-white leading-none">{projects.length}</span>
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
                const pct = projects.length > 0 ? Math.round((count / projects.length) * 100) : 0;
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
                      <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: barMounted ? `${pct}%` : "0%", backgroundColor: item.color, opacity: 0.8 }} />
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center justify-between px-1 pt-1">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Total</span>
                <span className="text-sm font-black text-slate-700 dark:text-slate-200">{projects.length} projects</span>
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
                      style={{ width: barMounted ? `${pct}%` : "0%", backgroundColor: color, opacity: 0.8 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Active Projects list */}
      <section className="glass-card p-5">
        <div className="section-title">
          <h3>Active Projects</h3>
        </div>
        <div className="space-y-2 max-h-105 overflow-y-auto overflow-x-hidden pr-1 scrollbar-border min-w-0">
          {activeProjects.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No active projects.</p>
          ) : (
            activeProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                className="flex items-center justify-between p-4 rounded-lg bg-white/30 dark:bg-zinc-800/30 border border-transparent cursor-pointer card-hover"
              >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(59,35,21,0.08)", color: "var(--brand-mahogany)" }}>
                    <TrendingUp size={14} />
                  </div>
                  <div className="truncate pr-4">
                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate block">
                      {p.project_name}
                    </p>
                    <div className="flex gap-2 items-center mt-1">
                      {p.status_label && (
                        <span
                          className="text-[11px] whitespace-nowrap px-1.5 py-0.5 rounded font-bold uppercase text-white shadow-sm"
                          style={{ backgroundColor: p.status_color || "#64748b" }}
                        >
                          {p.status_label}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                        {p.unit_code || "-"}
                      </span>
                      {p.current_phase_name && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">{p.current_phase_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                {p.priority_name && (
                  <div className="shrink-0 pl-2">
                    <span
                      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${p.priority_color}22`, color: p.priority_color || "#94a3b8" }}
                    >
                      {p.priority_name}
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
}

