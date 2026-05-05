import ProjectGanttDB from "../../../components/dashboard/ProjectGanttDB";
import CapexTabs from "../../../components/dashboard/CapexTabs";
import { Database } from "lucide-react";

export default function CapexGanttPage() {
  return (
    <div className="space-y-4 pb-6 animate-page-enter">
      <CapexTabs />
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Database size={16} className="text-cyan-500" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Project Gantt Chart</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Phase-by-phase timeline. Click any row to expand phase details.
          </p>
        </div>
      </div>
      <ProjectGanttDB />
    </div>
  );
}
