"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle, AlertTriangle, CheckCircle2, TrendingUp, Users, Clock,
  Loader2, LayoutList, Building2, Home, X,
  Sparkles, UserCircle2,
} from "lucide-react";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
} from "chart.js";
import toast, { Toaster } from "react-hot-toast";

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
  created_at: string | null;
};

export default function DashboardHome() {
  const router = useRouter();
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [userCount, setUserCount] = useState(0);
  const [userActiveCount, setUserActiveCount] = useState(0);
  const [stakeholderCount, setStakeholderCount] = useState(0);
  const [stakeholderActiveCount, setStakeholderActiveCount] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);

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

  const newProjects = useMemo(
    () => projects.filter((p) => {
      if (!p.created_at || (p.overall_progress_pct ?? 0) >= 100) return false;
      const age = today - new Date(p.created_at).getTime();
      return age >= 0 && age <= 7 * DAY_MS;
    }),
    [projects, today]
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


  const DONUT_ITEMS = [
    { label: "Completed", color: "#22c55e", onClick: () => setShowCompleted(true) },
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

  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <Toaster position="top-right" />

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

        <div onClick={() => setShowCompleted(true)} className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 cursor-pointer card-hover">
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
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 rounded-full shrink-0" style={{ background: "var(--brand-espresso)" }} />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">Project Status Overview</h3>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Chart with center text overlay */}
            <div className="relative w-56 h-56 shrink-0 cursor-pointer">
              {projects.length > 0 ? (
                <>
                  <Doughnut
                    data={donutData}
                    options={{
                      maintainAspectRatio: true,
                      cutout: "72%",
                      animation: { animateRotate: true, animateScale: false, duration: 700 },
                      layout: { padding: 18 },
                      onClick: (_e, elements) => {
                        if (!elements.length) return;
                        DONUT_ITEMS[elements[0].index]?.onClick();
                      },
                      plugins: {
                        legend: { display: false },
                        tooltip: {
                          backgroundColor: "rgba(15,23,42,0.88)",
                          titleColor: "#f1f5f9",
                          bodyColor: "#94a3b8",
                          borderColor: "rgba(255,255,255,0.10)",
                          borderWidth: 1,
                          padding: { top: 9, bottom: 9, left: 13, right: 13 },
                          cornerRadius: 10,
                          boxPadding: 6,
                          boxWidth: 9,
                          boxHeight: 9,
                          titleFont: { family: "'Inter', ui-sans-serif, sans-serif", weight: "bold" as const, size: 12 },
                          bodyFont:  { family: "'Inter', ui-sans-serif, sans-serif", size: 11 },
                          callbacks: {
                            title: () => "",
                            label: (ctx) => `  ${ctx.label}: ${ctx.raw} projects`,
                          },
                        },
                      },
                    }}
                  />
                  {/* Center label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <span className="text-3xl font-black text-slate-800 dark:text-white leading-none">{projects.length}</span>
                    <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-1">Projects</span>
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
                  <div key={item.label} onClick={item.onClick} className="px-3.5 py-2.5 rounded-lg border border-slate-100 dark:border-white/7 bg-slate-50/60 dark:bg-white/3 hover:bg-white dark:hover:bg-white/6 transition-colors cursor-pointer">
                    <div className="flex items-center gap-2.5 mb-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: item.color, boxShadow: `0 0 6px ${item.color}80` }} />
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 flex-1">{item.label}</span>
                      <span className="text-sm font-black" style={{ color: item.color }}>{count}</span>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 w-8 text-right">{pct}%</span>
                    </div>
                    {/* Mini progress bar */}
                    <div className="h-1 rounded-full bg-slate-200 dark:bg-white/8 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: item.color, opacity: 0.75 }} />
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

        {/* Coming Soon */}
        <section className="glass-card p-5 flex flex-col items-center justify-center min-h-70">
          <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/6 flex items-center justify-center mb-3">
            <AlertCircle size={22} className="text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">Coming Soon</p>
          <p className="text-[11px] text-slate-300 dark:text-slate-600 mt-1">This section is under construction</p>
        </section>
      </div>

      {/* Active Projects list */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-1 h-4 rounded-full shrink-0" style={{ background: "var(--brand-espresso)" }} />
          <LayoutList size={14} style={{ color: "var(--brand-espresso)" }} />
          <h3 className="text-base font-bold text-slate-700 dark:text-slate-200">Active Projects</h3>
        </div>
        <div className="space-y-2 max-h-105 overflow-y-auto overflow-x-hidden pr-1 scrollbar-border min-w-0">
          {activeProjects.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">No active projects.</p>
          ) : (
            activeProjects.map((p) => (
              <div
                key={p.id}
                onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                className="flex items-center justify-between p-4 rounded-lg bg-white/30 dark:bg-zinc-800/30 border border-transparent hover:border-slate-200/50 dark:hover:border-white/10 hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-all cursor-pointer"
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

      {/* Completed Projects Modal */}
      {showCompleted && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-9998 flex items-center justify-center p-4 animate-backdrop-enter"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowCompleted(false); }}
        >
          <div
            className="w-full max-w-md max-h-[72vh] flex flex-col overflow-hidden rounded-xl border border-slate-200/80 dark:border-white/8 bg-white dark:bg-zinc-950 animate-modal-enter"
            style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
            onMouseDown={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-white/8 shrink-0">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-green-500" />
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Completed Projects</h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-400">
                  {completedProjects.length}
                </span>
              </div>
              <button
                onClick={() => setShowCompleted(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            {/* Modal list */}
            <div className="overflow-y-auto flex-1 p-3 space-y-1.5 scrollbar-border">
              {completedProjects.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No completed projects yet.</p>
              ) : (
                completedProjects.map(p => (
                  <div
                    key={p.id}
                    onClick={() => { setShowCompleted(false); router.push(`/dashboard/projects/${p.id}`); }}
                    className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 dark:border-white/6 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{p.project_name}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {p.unit_code && (
                          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">{p.unit_code}</span>
                        )}
                        {p.current_phase_name && (
                          <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.current_phase_name}</span>
                        )}
                        {p.status_label && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded text-white uppercase" style={{ backgroundColor: p.status_color || "#22c55e" }}>
                            {p.status_label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-xs font-bold text-green-500">{p.overall_progress_pct ?? 0}%</span>
                      {p.priority_name && (
                        <span className="text-[9px] font-bold uppercase" style={{ color: p.priority_color || "#94a3b8" }}>
                          {p.priority_name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

