import CapexGanttMonitor from "@/components/dashboard/CapexGanttMonitor";

export default function CapexGanttPage() {
  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 mt-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">CAPEX Gantt Monitor</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dedicated monitoring page for project timeline, progress, health status, and detailed execution tracking.
          </p>
        </div>
      </div>

      <CapexGanttMonitor />
    </div>
  );
}
