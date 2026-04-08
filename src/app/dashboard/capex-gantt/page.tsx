import CapexGanttMonitor from "@/components/dashboard/CapexGanttMonitor";

export default function CapexGanttPage() {
  return (
    <div className="space-y-4 pb-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">CAPEX Timeline</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Simple visual Gantt chart for CAPEX project tracking.</p>
        </div>
      </div>

      <CapexGanttMonitor />
    </div>
  );
}
