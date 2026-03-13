"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { AlertCircle, CheckCircle2, TrendingUp, Users, Clock, Loader2, LayoutList, PieChart, Star } from "lucide-react";
import { ClickUpTask } from "@/types/clickup";
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import toast, { Toaster } from 'react-hot-toast';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function DashboardHome() {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [liveEmployeeCount, setLiveEmployeeCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [selectedDept, setSelectedDept] = useState<string>('All');
  
  const previousTasksRef = useRef<Set<string>>(new Set());

  const fetchDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/clickup/tasks");
      const data = await res.json();
      if (data.success) {
        const incomingTasks: ClickUpTask[] = data.data;
        
        // Update live employee count from backend
        if (data.totalEmployees !== undefined) {
          setLiveEmployeeCount(data.totalEmployees);
        }
        
        // Notify for new incoming tasks
        if (previousTasksRef.current.size > 0) {
          incomingTasks.forEach(task => {
            if (!previousTasksRef.current.has(task.id)) {
              const deadline = task.due_date ? new Date(parseInt(task.due_date)).toLocaleDateString() : 'No Deadline';
              const dept = task.department || 'General';
              toast.custom((t) => (
                <div
                  className={`${
                    t.visible
                      ? 'opacity-100 translate-y-0 scale-100 animate-toast-pop-out'
                      : 'opacity-0 translate-y-2 scale-95'
                  } max-w-md w-full bg-white dark:bg-zinc-800 shadow-lg rounded-xl pointer-events-auto flex ring-1 ring-black/5 transform-gpu transition-all duration-300`}
                >
                  <div className="flex-1 w-0 p-4">
                    <div className="flex items-start">
                      <div className="flex-shrink-0 pt-0.5">
                        <AlertCircle className="h-10 w-10 text-blue-500" />
                      </div>
                      <div className="ml-3 flex-1">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Incoming Task!</p>
                        <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-semibold">{task.name}</span><br/>
                          Department: {dept}<br/>
                          Deadline: {deadline}
                        </p>
                      </div>
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

  const departments = ['All', 'IDEA', 'Marketing', 'Finance', 'HR'];

  const filteredTasks = useMemo(() => {
    if (selectedDept === 'All') return tasks;
    return tasks.filter(t => t.department === selectedDept);
  }, [tasks, selectedDept]);

  const getDisplayStatus = (statusStr: string) => {
    const s = statusStr.toLowerCase();
    if (s === 'complete') return 'COMPLETED';
    return statusStr;
  };

  const activeTasks = filteredTasks.filter(t => t.status.type !== 'closed' && t.status.status.toLowerCase() !== 'done' && t.status.status.toLowerCase() !== 'complete' && t.status.status.toLowerCase() !== 'completed');
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

  const pieChartData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const statusColors: Record<string, string> = {};

    filteredTasks.forEach(task => {
      const status = getDisplayStatus(task.status.status).toUpperCase();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (!statusColors[status]) {
        statusColors[status] = task.status.color || '#ccc';
      }
    });

    return {
      labels: Object.keys(statusCounts),
      datasets: [
        {
          data: Object.values(statusCounts),
          backgroundColor: Object.keys(statusCounts).map(s => statusColors[s]),
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.1)'
        },
      ],
    };
  }, [filteredTasks]);

  const completedHistory = useMemo(() => {
    return filteredTasks
      .filter(t => t.status.type === 'closed' || t.status.status.toLowerCase() === 'completed' || t.status.status.toLowerCase() === 'complete' || t.status.status.toLowerCase() === 'done')
      .sort((a, b) => parseInt(b.date_closed || b.date_created || '0') - parseInt(a.date_closed || a.date_created || '0'));
  }, [filteredTasks]);

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <Toaster position="top-right" />
      
      <div className="flex justify-between items-center mb-3 mt-2">
        <h2 className="text-xs font-bold text-slate-500 dark:text-slate-300 tracking-widest uppercase">Dashboard Overview</h2>
        <div className="flex items-center gap-1.5 text-[10px]">
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

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {departments.map(dept => (
          <button
            key={dept}
            onClick={() => setSelectedDept(dept)}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
              selectedDept === dept 
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 scale-105' 
                : 'bg-white/70 dark:bg-zinc-800/70 text-slate-600 dark:text-gray-300 border border-slate-200/60 dark:border-zinc-700/60 hover:bg-white dark:hover:bg-zinc-700 hover:scale-105'
            }`}
          >
            {dept}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="glass-card p-5 flex flex-col justify-between overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-2xl"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-slate-800 dark:text-white">
              {loading && tasks.length === 0 ? '...' : totalActive}
            </span>
            <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Active Tasks</p>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between overflow-hidden relative border-red-500/20">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-red-500 to-rose-500 rounded-t-2xl"></div>
          <div className="flex justify-between items-start mb-2">
            <span className="text-3xl font-bold text-red-600 dark:text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]">
              {loading && tasks.length === 0 ? '...' : overdueTasks.length}
            </span>
            <div className="p-2 bg-red-500/10 text-red-500 dark:text-red-400 rounded-lg">
              <Clock size={18} />
            </div>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">Overdue</p>
        </div>

        <div className="glass-card p-5 flex flex-col justify-between overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-2xl"></div>
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
      </div>

      <div className="glass-card p-5 flex items-center justify-between overflow-hidden relative">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400 via-blue-500 to-purple-500 rounded-t-2xl"></div>
        <div className="absolute -top-6 -right-6 w-24 h-24 bg-blue-500/5 dark:bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2 bg-gradient-to-br from-amber-400/20 to-blue-500/20 text-amber-500 dark:text-amber-400 rounded-xl border border-amber-500/20">
            <Star size={18} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest">Top Department</p>
            <h3 className="text-sm font-bold text-slate-700 dark:text-gray-200">Most Active Workload</h3>
          </div>
        </div>
        <div className="text-right relative z-10">
          <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400 bg-clip-text text-transparent">{mostActiveDept.dept}</span>
          <p className="text-xs font-medium text-slate-500 dark:text-gray-400">{mostActiveDept.count} active tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="glass-card p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-full flex-shrink-0"></div>
            <PieChart size={14} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200">Status Breakdown</h3>
          </div>
          <div className="flex justify-center items-center h-64">
            {filteredTasks.length > 0 ? (
              <div className="w-full h-full relative">
                <Doughnut
                  data={{
                    ...pieChartData,
                    datasets: pieChartData.datasets.map(d => ({
                      ...d,
                      borderWidth: 3,
                      borderColor: 'rgba(255,255,255,0.12)',
                      hoverBorderColor: 'rgba(255,255,255,0.5)',
                      hoverOffset: 8,
                    }))
                  }}
                  options={{
                    cutout: '65%',
                    plugins: {
                      legend: {
                        position: 'bottom',
                        labels: {
                          color: '#94a3b8',
                          font: { size: 10 },
                          padding: 12,
                          boxWidth: 8,
                          boxHeight: 8,
                          usePointStyle: true,
                          pointStyle: 'circle'
                        }
                      },
                      tooltip: {
                        callbacks: {
                          label: function(ctx) {
                            const total = (ctx.dataset.data as number[]).reduce((a, b) => a + b, 0);
                            const pct = Math.round(((ctx.raw as number) / total) * 100);
                            return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                          }
                        }
                      }
                    },
                    maintainAspectRatio: false
                  }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-10">
                  <span className="text-2xl font-bold text-slate-800 dark:text-white leading-none">{filteredTasks.length}</span>
                  <span className="text-[10px] text-slate-500 dark:text-gray-400 font-medium mt-0.5">tasks</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-gray-400">No tasks in this department.</p>
            )}
          </div>
        </section>

        <section className="glass-card p-5 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3 shrink-0">
            <div className="w-1 h-4 bg-gradient-to-b from-green-500 to-emerald-600 rounded-full flex-shrink-0"></div>
            <CheckCircle2 size={14} className="text-green-500" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200">Completed Tasks</h3>
          </div>
          <div className="space-y-2">
            {completedHistory.length === 0 ? (
              <div className="flex justify-center items-center h-64">
                <p className="text-xs text-slate-500 dark:text-gray-400">No completed tasks yet.</p>
              </div>
            ) : (
              completedHistory.map(task => (
                <div key={task.id} className="p-3 rounded-xl hover:bg-white/40 dark:hover:bg-zinc-800/40 transition-all duration-200 group">
                  <div className="flex justify-between items-start gap-2">
                    <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-slate-700 dark:text-gray-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 line-clamp-2 leading-tight transition-colors">
                      {task.name}
                    </a>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span 
                      className="text-[9px] whitespace-nowrap px-1.5 py-0.5 rounded font-bold uppercase text-white shadow-sm"
                      style={{ backgroundColor: task.status.color || '#ccc' }}
                    >
                      {getDisplayStatus(task.status.status)}
                    </span>
                    <div className="flex -space-x-1">
                      {task.assignees?.slice(0,3).map(a => (
                        <div
                          key={a.id}
                          className="relative group/cavatar w-5 h-5 rounded-full border border-white/60 dark:border-zinc-800 flex items-center justify-center text-[8px] font-bold text-white shadow-sm cursor-pointer transition-transform duration-150 hover:scale-125 hover:z-10"
                          style={{ backgroundColor: a.color || '#999' }}
                        >
                          {a.initials}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="glass-card p-5">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-1 h-4 bg-gradient-to-b from-indigo-500 to-blue-600 rounded-full flex-shrink-0"></div>
          <LayoutList size={14} className="text-indigo-500" />
          <h3 className="text-sm font-semibold text-slate-700 dark:text-gray-200">Active Tasks <span className="text-slate-400 dark:text-gray-500 font-normal">· {selectedDept}</span></h3>
        </div>
        <div className="space-y-2">
          {activeTasks.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-gray-400 text-center py-4">No active tasks.</p>
          ) : (
            activeTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-all duration-200 border border-transparent hover:border-slate-200/50 dark:hover:border-white/10 group">
                <div className="flex items-center gap-3 overflow-hidden flex-1">
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:bg-blue-500/20 transition-colors">
                    <TrendingUp size={14} />
                  </div>
                  <div className="truncate pr-4">
                    <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-slate-800 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate block transition-colors">
                      {task.name}
                    </a>
                    <div className="flex gap-2 items-center mt-1">
                      <span 
                        className="text-[10px] whitespace-nowrap px-1.5 py-0.5 rounded font-bold uppercase text-white shadow-sm"
                        style={{ backgroundColor: task.status.color || '#ccc' }}
                      >
                        {getDisplayStatus(task.status.status)}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-gray-400">{task.department || 'General'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 pl-2">
                  <span className="text-[9px] font-medium text-slate-400 dark:text-gray-500 uppercase tracking-wide mb-1">Assignee</span>
                  <div className="flex pl-2">
                    {task.assignees?.map(a => (
                      <div
                        key={a.id}
                        className="relative group/avatar w-7 h-7 rounded-full border-2 border-white/60 dark:border-zinc-800 flex items-center justify-center text-[10px] font-bold text-white -ml-2 cursor-pointer shadow-sm transition-transform duration-150 hover:scale-125 hover:z-10 hover:shadow-md"
                        style={{ backgroundColor: a.color || '#999' }}
                      >
                        {a.initials}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

    </div>
  );
}
