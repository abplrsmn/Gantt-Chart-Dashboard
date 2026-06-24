"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import SCurveCharts from "@/components/dashboard/SCurveCharts";

type DBProject = {
  id: string;
  project_name: string;
  unit_code: string | null;
  unit_name: string | null;
  start_date: string | null;
  end_date: string | null;
  brief_received: string | null;
  brief_deadline: string | null;
  brief_progress: number | null;
  design_start: string | null;
  design_end: string | null;
  design_progress: number | null;
  control_start: string | null;
  control_end: string | null;
  control_progress: number | null;
  pm_start: string | null;
  pm_end: string | null;
  pm_progress: number | null;
  handover_start: string | null;
  handover_end: string | null;
  handover_progress: number | null;
  overall_progress_pct: string | null;
  current_phase_code?: string | null;
};

export default function PerformancePage() {
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (j.success) setProjects(j.data ?? []); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <div className="flex items-start gap-2 mb-3 mt-2">
        <Activity className="text-blue-500" size={16} />
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Project Performance</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            S-Curve Analysis · Plan vs Actual Progress
          </p>
        </div>
      </div>

      {loading ? (
        <div className="glass-card p-16 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-card p-16 text-center text-sm text-slate-400">No projects found.</div>
      ) : (
        projects.map(project => (
          <SCurveCharts key={project.id} projects={[project]} />
        ))
      )}
    </div>
  );
}
