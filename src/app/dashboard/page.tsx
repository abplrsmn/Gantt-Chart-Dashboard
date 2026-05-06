"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  AlertCircle, CheckCircle2, TrendingUp, Users, Clock,
  Loader2, LayoutList, PieChart, Star, Building2, Network,
} from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Filler, Tooltip, Legend,
} from "chart.js";
import toast, { Toaster } from "react-hot-toast";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

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

type LatestReminderLog = {
  id: number;
  created_at?: string | null;
  sent_at?: string | null;
  channel?: string | null;
  message_subject?: string | null;
  message_body?: string | null;
  is_simulated?: boolean | null;
  role_name?: string | null;
  unit_code?: string | null;
  unit_name?: string | null;
};

export default function DashboardHome() {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [latestReminder, setLatestReminder] = useState<LatestReminderLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      const [projectsRes, reminderRes] = await Promise.all([
        fetch("/api/projects/gantt"),
        fetch("/api/reminder-logs/latest", { cache: "no-store" }),
      ]);

      const projectsData = await projectsRes.json();
      const reminderData = await reminderRes.json();

      if (projectsData.success) {
        setProjects(projectsData.data);
        setLastSynced(new Date());
      }
      if (reminderData?.success) {
        setLatestReminder(reminderData.data || null);
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
    () => projects.filter((p) => (p.overall_progress_pct ?? 0) < 95 && (p.handover_progress ?? 0) < 100),
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

  const completedProjects = useMemo(
    () =>
      projects
        .filter((p) => (p.overall_progress_pct ?? 0) >= 95 || (p.handover_progress ?? 0) >= 100)
        .sort((a, b) => (b.overall_progress_pct ?? 0) - (a.overall_progress_pct ?? 0)),
    [projects]
  );

  const uniqueUnits = useMemo(
    () => [...new Set(projects.map((p) => p.unit_code).filter(Boolean))],
    [projects]
  );

  const mostActiveUnit = useMemo(() => {
    if (projects.length === 0) return { unit: "N/A", count: 0 };
    const counts: Record<string, number> = {};
    activeProjects.forEach((p) => {
      const u = p.unit_code || "Unknown";
      counts[u] = (counts[u] || 0) + 1;
    });
    let top = "N/A";
    let max = 0;
    Object.entries(counts).forEach(([u, c]) => {
      if (c > max) { max = c; top = u; }
    });
    return { unit: top, count: max };
  }, [projects, activeProjects]);

  const overallPerformanceData = useMemo(() => {
    const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyTotals = Array(12).fill(0) as number[];
    const monthlyProgressSum = Array(12).fill(0) as number[];

    projects.forEach((p) => {
      const d = p.start_date ? new Date(p.start_date) : null;
      if (!d) return;
      const m = d.getMonth();
      monthlyTotals[m] += 1;
      monthlyProgressSum[m] += p.overall_progress_pct ?? 0;
    });

    const values = monthLabels.map((_, i) =>
      monthlyTotals[i] === 0 ? 0 : Math.round(monthlyProgressSum[i] / monthlyTotals[i])
    );

    return { labels: monthLabels, values };
  }, [projects]);

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <Toaster position="top-right" />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 mt-2">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Dashboard Overview</h2>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? "..." : activeProjects.length}
            </span>
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Active Projects</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative border-red-500/20 min-h-27">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? "..." : overdueProjects.length}
            </span>
            <div className="p-2 bg-red-500/10 text-red-500 dark:text-red-400 rounded-lg">
              <Clock size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Overdue</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">0</span>
            <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
              <Users size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Employees</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27 border-cyan-400/20">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? "..." : uniqueUnits.length}
            </span>
            <div className="p-2 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 rounded-lg">
              <Building2 size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Units</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-27">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">0</span>
            <div className="p-2 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 rounded-lg">
              <Network size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Teams</p>
        </div>
      </div>

      {/* Top Unit */}
      <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 overflow-hidden relative">
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2 bg-linear-to-br from-amber-400/20 to-blue-500/20 text-amber-500 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <Star size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Top Unit</p>
            <h3 className="text-sm font-bold text-slate-700 dark:text-gray-200">Most Active Workload</h3>
          </div>
        </div>
        <div className="text-left sm:text-right relative z-10">
          <span className="text-xl font-bold text-slate-800 dark:text-white">{mostActiveUnit.unit}</span>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">{mostActiveUnit.count} projects</p>
        </div>
      </div>

      {/* Three panels */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Overall Performance */}
        <section className="glass-card p-5 xl:col-span-1">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-linear-to-b from-blue-500 to-indigo-600 rounded-full shrink-0" />
            <PieChart size={14} className="text-blue-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Overall Performance</h3>
          </div>
          <div className="flex justify-center items-center h-64">
            {projects.length > 0 ? (
              <div className="w-full h-full">
                <Line
                  data={{
                    labels: overallPerformanceData.labels,
                    datasets: [
                      {
                        label: "Avg Progress (%)",
                        data: overallPerformanceData.values,
                        borderColor: "#4f46e5",
                        backgroundColor: "rgba(79,70,229,0.14)",
                        pointBackgroundColor: "#4f46e5",
                        pointBorderColor: "#ffffff",
                        pointRadius: 4,
                        pointHoverRadius: 5,
                        tension: 0.42,
                        fill: true,
                      },
                    ],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                        position: "bottom",
                        labels: {
                          color: "#94a3b8",
                          font: { size: 10 },
                          usePointStyle: true,
                          pointStyle: "line",
                          boxWidth: 24,
                          padding: 14,
                        },
                      },
                      tooltip: { callbacks: { label: (ctx) => ` Avg Progress: ${ctx.raw}%` } },
                    },
                    scales: {
                      y: {
                        min: 0, max: 100,
                        ticks: { callback: (v) => `${v}%`, color: "#94a3b8", font: { size: 10 } },
                        grid: { color: "rgba(148,163,184,0.14)" },
                      },
                      x: {
                        ticks: { color: "#94a3b8", font: { size: 10 } },
                        grid: { color: "rgba(148,163,184,0.08)" },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-gray-400">No data available.</p>
            )}
          </div>
        </section>

        {/* Completed Projects */}
        <section className="glass-card p-5 flex flex-col xl:col-span-1">
          <div className="flex items-center gap-2.5 mb-3 shrink-0">
            <div className="w-1 h-4 bg-linear-to-b from-green-500 to-emerald-600 rounded-full shrink-0" />
            <CheckCircle2 size={14} className="text-green-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Completed Projects</h3>
          </div>
          <div className="space-y-2 max-h-90 overflow-y-auto overflow-x-hidden pr-1 scrollbar-border min-w-0">
            {completedProjects.length === 0 ? (
              <div className="flex justify-center items-center h-64">
                <p className="text-xs text-slate-500 dark:text-gray-400">No completed projects yet.</p>
              </div>
            ) : (
              completedProjects.map((p) => (
                <div key={p.id} className="block p-3 rounded-xl bg-white/20 dark:bg-zinc-800/20">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-gray-200 line-clamp-2 leading-tight">
                      {p.project_name}
                    </p>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span
                      className="text-[11px] whitespace-nowrap px-1.5 py-0.5 rounded font-bold uppercase text-white shadow-sm"
                      style={{ backgroundColor: p.status_color || "#22c55e" }}
                    >
                      {p.status_label || "Completed"}
                    </span>
                    <span className="text-[11px] text-slate-400">{p.unit_code}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Latest Reminder */}
        <section className="glass-card p-5 flex flex-col xl:col-span-1">
          <div className="flex items-center gap-2.5 mb-3 shrink-0">
            <div className="w-1 h-4 bg-linear-to-b from-violet-500 to-fuchsia-600 rounded-full shrink-0" />
            <AlertCircle size={14} className="text-violet-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Latest Reminder Summary</h3>
          </div>
          <div className="flex-1 min-h-90 rounded-2xl border border-slate-200/60 dark:border-white/10 bg-white/30 dark:bg-zinc-900/20 p-4 overflow-hidden">
            {!latestReminder ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-slate-500 dark:text-gray-400 text-center">No reminder summary available yet.</p>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {latestReminder.role_name && (
                    <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300">
                      {latestReminder.role_name}
                    </span>
                  )}
                  {latestReminder.unit_code && (
                    <span className="rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                      {latestReminder.unit_code}
                    </span>
                  )}
                  {latestReminder.is_simulated && (
                    <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      Simulated
                    </span>
                  )}
                </div>
                <div className="mb-2">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-white">
                    {latestReminder.message_subject || "Reminder Summary"}
                  </h4>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-gray-400">
                    {latestReminder.sent_at || latestReminder.created_at
                      ? new Date((latestReminder.sent_at || latestReminder.created_at) as string).toLocaleString()
                      : "No timestamp"}
                  </p>
                </div>
                <div className="mt-2 flex-1 overflow-y-auto rounded-xl bg-slate-50/80 dark:bg-black/20 p-3">
                  <pre className="whitespace-pre-wrap wrap-break-word text-xs leading-5 text-slate-700 dark:text-slate-200 font-sans">
                    {String(latestReminder.message_body || "-").replace(/\\n/g, "\n")}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Active Projects list */}
      <section className="glass-card p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-1 h-4 bg-linear-to-b from-indigo-500 to-blue-600 rounded-full shrink-0" />
          <LayoutList size={14} className="text-indigo-500" />
          <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Active Projects</h3>
        </div>
        <div className="space-y-2 max-h-105 overflow-y-auto overflow-x-hidden pr-1 scrollbar-border min-w-0">
          {activeProjects.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-gray-400 text-center py-8">No active projects.</p>
          ) : (
            activeProjects.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between p-4 rounded-xl bg-white/30 dark:bg-zinc-800/30 border border-transparent hover:border-slate-200/50 dark:hover:border-white/10 hover:bg-white/50 dark:hover:bg-zinc-800/50 transition-all"
              >
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <TrendingUp size={14} />
                  </div>
                  <div className="truncate pr-4">
                    <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 truncate block">
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
                      <span className="text-xs font-semibold text-slate-600 dark:text-gray-400">
                        {p.unit_code || "—"}
                      </span>
                      {p.current_phase_name && (
                        <span className="text-xs text-slate-400 dark:text-slate-500">{p.current_phase_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 pl-2 gap-1">
                  {p.priority_name && (
                    <span
                      className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: `${p.priority_color}22`, color: p.priority_color || "#94a3b8" }}
                    >
                      {p.priority_name}
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-600 dark:text-gray-300">
                    {p.overall_progress_pct ?? 0}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
