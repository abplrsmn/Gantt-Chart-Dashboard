"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { AlertCircle, CheckCircle2, TrendingUp, Users, Clock, Loader2, LayoutList, PieChart, Star, X, Building2, Network } from "lucide-react";
import { ClickUpTask } from "@/types/clickup";
import { playNotificationSound } from "@/lib/notificationSound";
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import toast, { Toaster } from 'react-hot-toast';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type DepartmentSummary = {
  name: string;
  spaceId: string;
  teams: string[];
};

export default function DashboardHome() {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [liveEmployeeCount, setLiveEmployeeCount] = useState<number>(0);
  const [liveDepartmentCount, setLiveDepartmentCount] = useState<number>(0);
  const [liveTeamCount, setLiveTeamCount] = useState<number>(0);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  
  const previousTasksRef = useRef<Set<string>>(new Set());

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/clickup/tasks");
      const data = await res.json();
      if (data.success) {
        const incomingTasks: ClickUpTask[] = data.data;
        
        // Update live organization stats from backend
        if (data.totalEmployees !== undefined) {
          setLiveEmployeeCount(data.totalEmployees);
        }
        if (data.totalDepartments !== undefined) {
          setLiveDepartmentCount(data.totalDepartments);
        }
        if (data.totalTeams !== undefined) {
          setLiveTeamCount(data.totalTeams);
        }
        if (Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
        
        // Notify for new incoming tasks
        if (previousTasksRef.current.size > 0) {
          incomingTasks.forEach(task => {
            if (!previousTasksRef.current.has(task.id)) {
              const deadline = task.due_date ? new Date(parseInt(task.due_date)).toLocaleDateString() : 'No Deadline';
              const dept = task.department || 'General';
              playNotificationSound("alert-info");
              toast.custom((t) => (
                <div
                  className={`${
                    t.visible
                      ? 'animate-toast-enter'
                      : 'animate-toast-exit'
                  } max-w-md w-full bg-white dark:bg-zinc-800 shadow-lg rounded-xl pointer-events-auto flex ring-1 ring-black/5 transform-gpu will-change-transform`}
                >
                  <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 pt-0.5">
                        <AlertCircle className="h-9 w-9 text-blue-500" />
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">New Incoming Task</p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-semibold">{task.name}</span>
                          <br />
                          Department: {dept} • Deadline: {deadline}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toast.dismiss(t.id)}
                        className="ml-2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                        aria-label="Dismiss notification"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ), { duration: 5000 });
            }
          });
        }
        
        previousTasksRef.current = new Set(incomingTasks.map(t => t.id));
        setTasks(incomingTasks);
        setLastSynced(new Date());
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const intervalId = setInterval(fetchDashboardData, 15000);
    return () => clearInterval(intervalId);
  }, [fetchDashboardData]);


  const getDisplayStatus = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    if (s === 'complete') return 'COMPLETED';
    return statusStr;
  };

  const activeTasks = tasks.filter(t => t.status.type !== 'closed' && t.status.status.toLowerCase() !== 'done' && t.status.status.toLowerCase() !== 'complete' && t.status.status.toLowerCase() !== 'completed');
  const totalActive = activeTasks.length;

  const overdueTasks = activeTasks.filter(t => {
    if (t.due_date) return parseInt(t.due_date) < Date.now();
    return false; 
  });

  // Most Active Department Calculation
  const mostActiveDept = useMemo(() => {
    if (tasks.length === 0) return { dept: 'N/A', count: 0 };
    const deptCounts: Record<string, number> = {};
    const allActive = tasks.filter(t => t.status.type !== 'closed' && t.status.status.toLowerCase() !== 'done' && t.status.status.toLowerCase() !== 'complete' && t.status.status.toLowerCase() !== 'completed');
    
    allActive.forEach(t => {
      const d = t.department || 'General';
      deptCounts[d] = (deptCounts[d] || 0) + 1;
    });

    let topDept = 'N/A';
    let maxCount = 0;
    Object.entries(deptCounts).forEach(([dept, count]) => {
      if (count > maxCount) {
        maxCount = count;
        topDept = dept;
      }
    });

    return { dept: topDept, count: maxCount };
  }, [tasks]);

  const overallPerformanceData = useMemo(() => {
    const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyTotals = Array(12).fill(0) as number[];
    const monthlyCompleted = Array(12).fill(0) as number[];

    tasks.forEach((task) => {
      const createdMs = parseInt(task.date_created || '0', 10);
      if (!createdMs) return;

      const monthIndex = new Date(createdMs).getMonth();
      monthlyTotals[monthIndex] += 1;

      const status = task.status.status.toLowerCase();
      const isCompleted = task.status.type === 'closed' || ['completed', 'complete', 'done', 'closed'].includes(status);
      if (isCompleted) {
        monthlyCompleted[monthIndex] += 1;
      }
    });

    const values = monthLabels.map((_, i) => {
      const total = monthlyTotals[i];
      return total === 0 ? 0 : Math.round((monthlyCompleted[i] / total) * 100);
    });

    return { labels: monthLabels, values };
  }, [tasks]);

  const completedHistory = useMemo(() => {
    return tasks
      .filter(t => t.status.type === 'closed' || t.status.status.toLowerCase() === 'completed' || t.status.status.toLowerCase() === 'complete' || t.status.status.toLowerCase() === 'done')
      .sort((a, b) => parseInt(b.date_closed || b.date_created || '0') - parseInt(a.date_closed || a.date_created || '0'));
  }, [tasks]);

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <Toaster position="top-right" />
      
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 mt-2">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Dashboard Overview</h2>
        <div className="flex items-center gap-1.5 text-[11px]">
          {loading ? (
            <span className="text-blue-500 flex items-center gap-1.5 font-medium"><Loader2 size={11} className="animate-spin" /> Syncing...</span>
          ) : (
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 font-medium">
              <CheckCircle2 size={11} className="text-green-500" />
              Synced {lastSynced?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-[108px]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading && tasks.length === 0 ? '...' : totalActive}
            </span>
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Tasks</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative border-red-500/20 min-h-[108px]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading && tasks.length === 0 ? '...' : overdueTasks.length}
            </span>
            <div className="p-2 bg-red-500/10 text-red-500 dark:text-red-400 rounded-lg">
              <Clock size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Overdue</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-[108px]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading ? '...' : liveEmployeeCount}
            </span>
            <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-lg">
              <Users size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Employees</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-[108px] border-cyan-400/20">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading && departments.length === 0 ? '...' : liveDepartmentCount}
            </span>
            <div className="p-2 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 rounded-lg">
              <Building2 size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Departments</p>
        </div>

        <div className="glass-card flex-1 min-w-0 p-5 flex flex-col justify-between overflow-hidden relative min-h-[108px]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading && departments.length === 0 ? '...' : liveTeamCount}
            </span>
            <div className="p-2 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 rounded-lg">
              <Network size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Teams</p>
        </div>
      </div>

      <div className="glass-card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 overflow-hidden relative">
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2 bg-gradient-to-br from-amber-400/20 to-blue-500/20 text-amber-500 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <Star size={18} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Top Department</p>
            <h3 className="text-sm font-bold text-slate-700 dark:text-gray-200">Most Active Workload</h3>
          </div>
        </div>
        <div className="text-left sm:text-right relative z-10">
          <span className="text-xl font-bold text-slate-800 dark:text-white">{mostActiveDept.dept}</span>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">{mostActiveDept.count} tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full flex-shrink-0"></div>
            <PieChart size={14} className="text-blue-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Overall Performance</h3>
          </div>
          <div className="flex justify-center items-center h-64">
            {tasks.length > 0 ? (
              <div className="w-full h-full">
                <Line
                  data={{
                    labels: overallPerformanceData.labels,
                    datasets: [
                      {
                        label: 'Completion Rate (%)',
                        data: overallPerformanceData.values,
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.14)',
                        pointBackgroundColor: '#4f46e5',
                        pointBorderColor: '#ffffff',
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
                        position: 'bottom',
                        align: 'center',
                        labels: {
                          color: '#94a3b8',
                          font: { size: 10 },
                          usePointStyle: true,
                          pointStyle: 'line',
                          boxWidth: 24,
                          textAlign: 'center',
                          padding: 14,
                        },
                      },
                      tooltip: {
                        callbacks: {
                          label: (ctx) => ` Completion Rate: ${ctx.raw}%`,
                        },
                      },
                    },
                    scales: {
                      y: {
                        min: 0,
                        max: 100,
                        ticks: {
                          callback: (value) => `${value}%`,
                          color: '#94a3b8',
                          font: { size: 10 },
                        },
                        grid: {
                          color: 'rgba(148,163,184,0.14)',
                        },
                      },
                      x: {
                        ticks: {
                          color: '#94a3b8',
                          font: { size: 10 },
                        },
                        grid: {
                          color: 'rgba(148,163,184,0.08)',
                        },
                      },
                    },
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-gray-400">No tasks available.</p>
            )}
          </div>
        </section>

        <section className="glass-card p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3 shrink-0">
            <div className="w-1 h-4 bg-gradient-to-b from-green-500 to-emerald-600 rounded-full flex-shrink-0"></div>
            <CheckCircle2 size={14} className="text-green-500" />
            <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Completed Tasks</h3>
          </div>
          <div className="space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-1 scrollbar-border min-w-0">
            {completedHistory.length === 0 ? (
              <div className="flex justify-center items-center h-64">
                <p className="text-xs text-slate-500 dark:text-gray-400">No completed tasks yet.</p>
              </div>
            ) : (
              completedHistory.map(task => (
                <a key={task.id} href={task.url} target="_blank" rel="noopener noreferrer" className="block p-3 rounded-xl hover:bg-white/40 dark:hover:bg-zinc-800/40 transition-all duration-200 group">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-semibold text-slate-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2 leading-tight transition-colors">
                      {task.name}
                    </p>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span 
                      className="text-[11px] whitespace-nowrap px-1.5 py-0.5 rounded font-bold uppercase text-white shadow-sm"
                      style={{ backgroundColor: task.status.color || '#ccc' }}
                    >
                      {getDisplayStatus(task.status.status)}
                    </span>
                    <div className="flex -space-x-1">
                      {task.assignees?.slice(0,3).map(a => (
                        <div
                          key={a.id}
                          className="relative group/cavatar w-5 h-5 rounded-full border border-white/60 dark:border-zinc-800 flex items-center justify-center text-[10px] font-bold text-white shadow-sm cursor-pointer transition-transform duration-150 hover:scale-125 hover:z-10"
                          style={{ backgroundColor: a.color || '#999' }}
                          title={a.username}
                          aria-label={a.username}
                        >
                          {a.initials}
                          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/cavatar:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
                            {a.username}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </a>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="glass-card p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-1 h-4 bg-gradient-to-b from-indigo-500 to-blue-600 rounded-full flex-shrink-0"></div>
          <LayoutList size={14} className="text-indigo-500" />
          <h3 className="text-base font-bold text-slate-700 dark:text-gray-200">Tasks</h3>
        </div>
        <div className="space-y-2 max-h-[420px] overflow-y-auto overflow-x-hidden pr-1 scrollbar-border min-w-0">
          {activeTasks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-gray-400 text-center py-8">No active tasks.</p>
          ) : (
            <>
              {activeTasks.map(task => (
                <a key={task.id} href={task.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-xl hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-all duration-200 border border-transparent hover:border-slate-200/50 dark:hover:border-white/10 group">
                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                      <TrendingUp size={14} />
                    </div>
                    <div className="truncate pr-4">
                      <p className="text-sm font-semibold text-slate-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate block transition-colors">
                        {task.name}
                      </p>
                      <div className="flex gap-2 items-center mt-1">
                        <span 
                          className="text-[11px] whitespace-nowrap px-1.5 py-0.5 rounded font-bold uppercase text-white shadow-sm"
                          style={{ backgroundColor: task.status.color || '#ccc' }}
                        >
                          {getDisplayStatus(task.status.status)}
                        </span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-gray-400">{task.department || 'General'}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className="text-[11px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide mb-1">Assignee</span>
                    <div className="flex pl-2 max-w-[120px] overflow-hidden">
                      {task.assignees?.slice(0, 3).map(a => (
                        <div
                          key={a.id}
                          className="relative group/avatar w-7 h-7 rounded-full border-2 border-white/60 dark:border-zinc-800 flex items-center justify-center text-[11px] font-bold text-white -ml-2 cursor-pointer shadow-sm transition-transform duration-150 hover:scale-125 hover:z-10 hover:shadow-md"
                          style={{ backgroundColor: a.color || '#999' }}
                          title={a.username}
                          aria-label={a.username}
                        >
                          {a.initials}
                          <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/avatar:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
                            {a.username}
                          </span>
                        </div>
                      ))}
                      {task.assignees && task.assignees.length > 3 && (
                        <div className="-ml-2 w-7 h-7 rounded-full border-2 border-white/60 dark:border-zinc-800 bg-slate-200 dark:bg-zinc-700 text-[11px] font-bold text-slate-700 dark:text-slate-100 flex items-center justify-center">
                          +{task.assignees.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              ))}
              <div className="flex items-center justify-center gap-2 py-8 text-slate-400 dark:text-slate-500 border-t border-slate-100/50 dark:border-white/5 mt-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></span>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] animate-pulse">Waiting for new tasks</p>
              </div>
            </>
          )}
        </div>
      </section>

    </div>
  );
}
