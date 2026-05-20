"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import ProjectSummaryMatrix from "./ProjectSummaryMatrix";

type ProjectRow = {
  id: string;
  project_code: string | null;
  project_name: string;
  unit_code: string | null;
  unit_name: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  priority_code: string | null;
  status_label: string | null;
  [key: string]: unknown;
};

export default function ProjectSummaryMatrixPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); else setError(json.error ?? "error"); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);


  const filteredProjects = useMemo(() => projects.filter(p => {
    const haystack = [p.project_name, p.project_code, p.unit_code, p.unit_name, p.current_phase_name, p.status_label]
      .join(" ").toLowerCase();
    return haystack.includes(search.toLowerCase());
  }), [projects, search]);

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      Loading summary...
    </div>
  );

  if (error) return <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">❌ {error}</div>;

  return (
    <div className="space-y-4 pb-6 animate-page-enter">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => router.push("/dashboard/projects/gantt")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold bg-white/70 dark:bg-zinc-900/60 border border-slate-200/70 dark:border-white/10 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-white/5"
        >
          <ArrowLeft size={13} /> Back to Gantt
        </button>
        <label className="relative flex-1 min-w-60">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project, unit, phase, status..."
            className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white"
          />
        </label>
      </div>

      <ProjectSummaryMatrix projects={filteredProjects} />
    </div>
  );
}
