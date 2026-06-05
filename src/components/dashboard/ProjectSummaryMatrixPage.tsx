"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import ProjectSummaryMatrix from "./ProjectSummaryMatrix";
import AnimatedDropdown from "./AnimatedDropdown";

type ProjectRow = {
  id: string;
  project_code: string | null;
  project_name: string;
  unit_code: string | null;
  unit_name: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  priority_code: string | null;
  priority_name: string | null;
  status_label: string | null;
  brief_pic: string | null;
  design_pic: string | null;
  control_pic: string | null;
  pm_pic: string | null;
  handover_pic: string | null;
  [key: string]: unknown;
};

function getCurrentPic(p: ProjectRow): string | null {
  const map: Record<string, string | null> = {
    operational_brief:   p.brief_pic,
    design:              p.design_pic,
    project_control:     p.control_pic,
    project_management:  p.pm_pic,
    handover:            p.handover_pic,
  };
  return (p.current_phase_code && map[p.current_phase_code]) || null;
}


export default function ProjectSummaryMatrixPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("ALL");
  const [prioFilter,  setPrioFilter]  = useState("ALL");
  const [picFilter,   setPicFilter]   = useState("ALL");

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); else setError(json.error ?? "error"); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const phases = useMemo(() => [...new Set(projects.map(p => p.current_phase_name).filter(Boolean) as string[])].sort(), [projects]);
  const prios  = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of projects) if (p.priority_code) seen.set(p.priority_code, p.priority_name ?? p.priority_code);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [projects]);

  const filteredProjects = useMemo(() => projects.filter(p => {
    if (phaseFilter !== "ALL" && p.current_phase_name !== phaseFilter) return false;
    if (prioFilter  !== "ALL" && p.priority_code !== prioFilter) return false;
    if (picFilter   !== "ALL" && getCurrentPic(p) !== picFilter) return false;
    if (search) {
      const hay = [p.project_name, p.project_code, p.unit_code, p.unit_name, p.current_phase_name, p.status_label]
        .join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [projects, search, phaseFilter, prioFilter, picFilter]);

  const phaseOptions = useMemo(() => [
    { value: "ALL", label: "All Phases" },
    ...phases.map(ph => ({ value: ph, label: ph })),
  ], [phases]);

  const prioOptions = useMemo(() => [
    { value: "ALL", label: "All Priorities" },
    ...prios.map(([code, name]) => ({ value: code, label: name })),
  ], [prios]);

  const picOptions = useMemo(() => {
    const all = projects.map(getCurrentPic).filter((v): v is string => !!v);
    return [
      { value: "ALL", label: "All PIC" },
      ...Array.from(new Set(all)).sort().map(pic => ({ value: pic, label: pic })),
    ];
  }, [projects]);

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm gap-2">
      <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      Loading summary...
    </div>
  );

  if (error) return <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-sm">❌ {error}</div>;

  const hasFilter = phaseFilter !== "ALL" || prioFilter !== "ALL" || picFilter !== "ALL" || search;

  return (
    <div className="space-y-4 pb-6 animate-page-enter">
      {/* Toolbar: Back | Search | Filters */}
      <div className="flex items-center gap-3 mb-4">

        {/* Back */}
        <button
          onClick={() => router.push("/dashboard/projects/gantt")}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {/* Search — grows to fill middle */}
        <div className="flex-1 flex justify-center">
          <label className="relative w-full max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search project, unit, phase..."
              className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white"
            />
          </label>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 shrink-0">
          <AnimatedDropdown value={phaseFilter} options={phaseOptions} onChange={setPhaseFilter} minWidth={168} align="right" />
          <AnimatedDropdown value={prioFilter}  options={prioOptions}  onChange={setPrioFilter}  minWidth={148} align="right" />
          {picOptions.length > 1 && (
            <AnimatedDropdown value={picFilter} options={picOptions} onChange={setPicFilter} minWidth={148} align="right" />
          )}
          {hasFilter && (
            <button
              onClick={() => { setSearch(""); setPhaseFilter("ALL"); setPrioFilter("ALL"); setPicFilter("ALL"); }}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors px-2 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/8"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <ProjectSummaryMatrix projects={filteredProjects} />
    </div>
  );
}
