"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { AlertCircle, Clock, Calendar, Loader2, ShieldAlert, CheckCircle2, X } from "lucide-react";
import { ClickUpTask } from "@/types/clickup";
import toast, { Toaster } from "react-hot-toast";
import { playNotificationSound } from "@/lib/notificationSound";

export default function AlertsPage() {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "overdue" | "near">("all");
  const previousAlertIdsRef = useRef<Set<string>>(new Set());
  const hasAlertBaselineRef = useRef(false);

  const fetchTasks = async () => {
    try {
      const res = await fetch("/api/clickup/tasks");
      const data = await res.json();
      if (data.success) {
        setTasks(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch tasks for alerts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 15000); // Sync every 15s (same as incoming task polling)
    return () => clearInterval(interval);
  }, []);

  const alerts = useMemo(() => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const threeDaysMs = 3 * oneDayMs;

    return tasks
      .filter(task => {
        // Only active tasks
        const status = task.status.status.toLowerCase();
        return !['complete', 'completed', 'done', 'closed'].includes(status);
      })
      .map(task => {
        const dueDate = task.due_date ? parseInt(task.due_date) : null;
        let type: 'overdue' | 'near' | 'stuck' = 'stuck';
        let severity: 'critical' | 'warning' | 'info' = 'info';
        let message = "";

        if (dueDate) {
          if (dueDate < now) {
            type = 'overdue';
            severity = 'critical';
            message = "Task is already overdue!";
          } else if (dueDate - now < oneDayMs) {
            type = 'near';
            severity = 'warning';
            message = "Deadline is less than 24 hours away!";
          } else if (dueDate - now < threeDaysMs) {
            type = 'near';
            severity = 'info';
            message = "Approaching deadline (within 3 days)";
          }
        }

        return { ...task, alertType: type, severity, alertMessage: message };
      })
      .filter(task => task.alertType !== 'stuck' || task.severity !== 'info') // Only show actual alerts
      .sort((a, b) => {
        // Sort by severity (critical first) then by due date
        const severityMap = { critical: 0, warning: 1, info: 2, stuck: 3 };
        if (severityMap[a.severity] !== severityMap[b.severity]) {
          return severityMap[a.severity] - severityMap[b.severity];
        }
        return (parseInt(a.due_date || "0") - parseInt(b.due_date || "0"));
      });
  }, [tasks]);

  const filteredAlerts = useMemo(() => {
    if (selectedFilter === "all") return alerts;
    return alerts.filter((task) => task.alertType === selectedFilter);
  }, [alerts, selectedFilter]);

  useEffect(() => {
    if (loading) return;

    const currentAlertIds = new Set(alerts.map((task) => task.id));

    // Skip notifications on first load to avoid spamming existing alerts.
    if (!hasAlertBaselineRef.current) {
      previousAlertIdsRef.current = currentAlertIds;
      hasAlertBaselineRef.current = true;
      return;
    }

    alerts.forEach((task) => {
      if (!previousAlertIdsRef.current.has(task.id)) {
        playNotificationSound("alert-critical");

        toast.custom(
          (t) => (
            <div
              className={`${
                t.visible ? "animate-toast-enter" : "animate-toast-exit"
              } max-w-md w-full bg-white dark:bg-zinc-800 shadow-lg rounded-xl pointer-events-auto flex ring-1 ring-black/5 transform-gpu will-change-transform`}
            >
              <div className="flex-1 w-0 p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0 pt-0.5">
                    <AlertCircle
                      className={`h-9 w-9 ${
                        task.severity === "critical"
                          ? "text-red-500"
                          : task.severity === "warning"
                          ? "text-amber-500"
                          : "text-blue-500"
                      }`}
                    />
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">New Alert Task</p>
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                      <span className="font-semibold">{task.name}</span>
                      <br />
                      {task.alertMessage}
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
          ),
          { duration: 5000 }
        );
      }
    });

    previousAlertIdsRef.current = currentAlertIds;
  }, [alerts, loading]);

  if (loading && tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Loader2 className="animate-spin text-blue-500 mb-4" size={32} />
        <p className="text-sm font-medium text-slate-500">Scanning for alerts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <Toaster position="top-right" />
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-red-500" size={24} />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Live Alerts</h2>
        </div>
        <div className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 uppercase tracking-widest">
          {filteredAlerts.length} Active Alerts
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {[
          { key: "all", label: "All" },
          { key: "overdue", label: "Overdue" },
          { key: "near", label: "Near" },
        ].map((filterOption) => (
          <button
            key={filterOption.key}
            type="button"
            onClick={() => setSelectedFilter(filterOption.key as "all" | "overdue" | "near")}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 ${
              selectedFilter === filterOption.key
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/25"
                : "bg-white/60 dark:bg-zinc-800/60 text-slate-600 dark:text-gray-300 border border-slate-200/60 dark:border-zinc-700/60 hover:bg-white dark:hover:bg-zinc-700"
            }`}
          >
            {filterOption.label}
          </button>
        ))}
      </div>

      {filteredAlerts.length > 0 ? (
        <div className="grid gap-4">
          {filteredAlerts.map((task) => (
            <a key={task.id} href={task.url} target="_blank" rel="noopener noreferrer" className={`block p-4 rounded-xl bg-white/40 dark:bg-zinc-800/40 border-l-4 border border-transparent relative overflow-visible transition-all duration-200 hover:bg-white/60 dark:hover:bg-zinc-800/60 hover:border-slate-200/50 dark:hover:border-white/10 group ${
              task.severity === 'critical' ? 'border-l-red-500' : 
              task.severity === 'warning' ? 'border-l-amber-500' : 
              'border-l-blue-500'
            }`}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                      task.severity === 'critical' ? 'bg-red-500 text-white' : 
                      task.severity === 'warning' ? 'bg-amber-500 text-white' : 
                      'bg-blue-500 text-white'
                    }`}>
                      {task.alertType}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">
                      {task.department}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {task.name}
                  </h3>
                  <p className={`text-xs font-medium mb-3 ${
                    task.severity === 'critical' ? 'text-red-600 dark:text-red-400' : 
                    task.severity === 'warning' ? 'text-amber-600 dark:text-amber-400' : 
                    'text-blue-600 dark:text-blue-400'
                  }`}>
                    {task.alertMessage}
                  </p>
                  
                  <div className="flex items-center gap-4 text-[11px] text-slate-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Calendar size={12} />
                      {task.due_date ? new Date(parseInt(task.due_date)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No Due Date'}
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      {task.due_date ? 
                        (() => {
                          const date = new Date(parseInt(task.due_date));
                          // Tambahkan manual offset ke GMT+7 (WIB) jika diperlukan, 
                          // tapi biasanya browser user sudah otomatis WIB.
                          return date.toLocaleTimeString('id-ID', { 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            hour12: false,
                            timeZone: 'Asia/Jakarta' 
                          }) + " WIB";
                        })()
                        : ''}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-3">
                  <div className="flex pl-2">
                    {task.assignees?.map(a => (
                      <div
                        key={a.id}
                        className="relative group/avatar w-7 h-7 rounded-full border-2 border-white/60 dark:border-zinc-800 flex items-center justify-center text-[10px] font-bold text-white -ml-2 cursor-pointer shadow-sm transition-transform duration-150 hover:scale-125 hover:z-10 hover:shadow-md"
                        style={{ backgroundColor: a.color || '#999' }}
                        title={a.username}
                        aria-label={a.username}
                      >
                        {a.initials}
                        <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/avatar:opacity-100 dark:bg-zinc-100 dark:text-zinc-900">
                          {a.username}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-gray-100 mb-1">All Clear!</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 max-w-xs leading-relaxed">
            {selectedFilter === "all"
              ? "No overdue tasks or approaching deadlines detected at the moment. Keep up the great work!"
              : `No ${selectedFilter} alerts right now.`}
          </p>
        </div>
      )}
    </div>
  );
}
