"use client";

import { useState, useEffect } from "react";
import SCurveCharts from "../../../components/dashboard/SCurveCharts";
import CapexTabs from "../../../components/dashboard/CapexTabs";
import { Activity } from "lucide-react";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); else setError(json.error ?? "error"); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500 bg-red-500/10 rounded-xl border border-red-500/20">
        Error loading projects: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <CapexTabs />
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mt-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className="text-cyan-500" />
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Projects Detailed Analysis</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Select a project to view its detailed S-Curve, Phase Breakdown, and Progress.
          </p>
        </div>
      </div>
      
      {/* 
        We pass the fetched projects to SCurveCharts. 
        SCurveCharts already has a "Select Project" dropdown built in!
      */}
      <SCurveCharts projects={projects} />
    </div>
  );
}
