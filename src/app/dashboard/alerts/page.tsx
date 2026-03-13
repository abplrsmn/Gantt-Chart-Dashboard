"use client";

import { useEffect, useState, useMemo } from "react";
import { AlertCircle, Clock, Calendar, ArrowRight, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { ClickUpTask } from "@/types/clickup";

export default function AlertsPage() {
  const [tasks, setTasks] = useState<ClickUpTask[]>([]);
  const [loading, setLoading] = useState(true);

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
    const interval = setInterval(fetchTasks, 30000); // Sync every 30s
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
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="text-red-500" size={24} />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Live Alerts</h2>
        </div>
        <div className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-zinc-800 text-slate-500 uppercase tracking-widest">
          {alerts.length} Active Alerts
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="grid gap-4">
          {alerts.map((task) => (
            <div key={task.id} className={`glass-card p-4 border-l-4 relative overflow-hidden transition-all hover:scale-[1.01] ${
              task.severity === 'critical' ? 'border-l-red-500 bg-red-500/5' : 
              task.severity === 'warning' ? 'border-l-amber-500 bg-amber-500/5' : 
              'border-l-blue-500 bg-blue-500/5'
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
                  <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-1 truncate">
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
                  <div className="flex -space-x-2">
                    {task.assignees?.map(a => (
                      <div
                        key={a.id}
                        className="w-7 h-7 rounded-full border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                        style={{ backgroundColor: a.color || '#999' }}
                        title={a.username}
                      >
                        {a.initials}
                      </div>
                    ))}
                  </div>
                  <a 
                    href={task.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-gray-300 hover:text-blue-500 transition-colors shadow-sm"
                  >
                    <ArrowRight size={16} />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mb-4">
            <CheckCircle2 size={32} />
          </div>
          <h3 className="text-base font-bold text-slate-800 dark:text-gray-100 mb-1">All Clear!</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 max-w-xs leading-relaxed">
            No overdue tasks or approaching deadlines detected at the moment. Keep up the great work!
          </p>
        </div>
      )}
    </div>
  );
}
