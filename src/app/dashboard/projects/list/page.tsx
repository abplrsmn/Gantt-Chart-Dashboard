"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { format } from "date-fns";

type DBProject = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: string | null;
  start_date: string | null;
  end_date: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  status_label: string | null;
  priority_name: string | null;
  priority_code: string | null;
  priority_color: string | null;
  unit_code: string | null;
  unit_name: string | null;
  brief_received: string | null;
  brief_deadline: string | null;
  design_start: string | null;
  design_end: string | null;
  control_start: string | null;
  control_end: string | null;
  pm_start: string | null;
  pm_end: string | null;
  handover_start: string | null;
  handover_end: string | null;
  brief_pic: string | null;
  design_pic: string | null;
  control_pic: string | null;
  pm_pic: string | null;
  handover_pic: string | null;
};

function getCurrentPic(p: DBProject): string | null {
  const map: Record<string, string | null> = {
    operational_brief: p.brief_pic,
    design:            p.design_pic,
    project_control:   p.control_pic,
    project_management: p.pm_pic,
    handover:          p.handover_pic,
  };
  return (p.current_phase_code && map[p.current_phase_code]) || null;
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444", HIGH: "#f97316", MID: "#eab308", LOW: "#22c55e",
};

const PHASE_COLORS: Record<string, string> = {
  operational_brief: "#64748b", design: "#3b82f6",
  project_control: "#f59e0b", project_management: "#14b8a6", handover: "#22c55e",
};

function ProjectListContent() {
  const router = useRouter();
  const params = useSearchParams();
  const startParam = params.get("start") ?? "";
  const endParam   = params.get("end")   ?? "";

  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rangeStart = useMemo(() => toDate(startParam), [startParam]);
  const rangeEnd   = useMemo(() => toDate(endParam),   [endParam]);

  const filtered = useMemo(() => {
    const inRange = (rangeStart && rangeEnd)
      ? projects.filter(p => {
          const projectStart = toDate(p.start_date);
          const projectEnd   = toDate(p.end_date);

          // Mirror Gantt rangeSummary: project-level overlap OR phase-level overlap
          const hasProjectOverlap = !!(
            projectStart && projectEnd &&
            projectStart <= rangeEnd && projectEnd >= rangeStart
          );
          if (hasProjectOverlap) return true;

          const pairs: [string | null, string | null][] = [
            [p.brief_received,  p.brief_deadline],
            [p.design_start,    p.design_end],
            [p.control_start,   p.control_end],
            [p.pm_start,        p.pm_end],
            [p.handover_start,  p.handover_end],
          ];
          return pairs.some(([s, e]) => {
            const sd = toDate(s);
            const ed = toDate(e);
            if (!sd && !ed) return false;
            // Mirror buildSegments fallback: missing start → project start, missing end → start + 14d
            const phStart = sd ?? (projectStart ?? ed!);
            const phEnd   = ed ?? new Date(phStart.getTime() + 14 * 86_400_000);
            if (phEnd < phStart) return false;
            return phStart <= rangeEnd && phEnd >= rangeStart;
          });
        })
      : projects;

    const q = search.trim().toLowerCase();
    return q
      ? inRange.filter(p =>
          [p.project_name, p.project_code, p.unit_code, p.unit_name, p.current_phase_name, p.status_label]
            .join(" ").toLowerCase().includes(q))
      : inRange;
  }, [projects, search, rangeStart, rangeEnd]);

  return (
    <div className="space-y-4 pb-8 animate-page-enter">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/dashboard/projects/gantt")}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Back
        </button>
      </div>

      {/* Search */}
      <div className="flex justify-center">
        <div className="relative w-full max-w-md">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search project name, unit, stage…"
            className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-sm outline-none text-slate-800 dark:text-white"
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-12 flex flex-col items-center gap-3 text-center">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">No projects found for this range.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200/60 dark:border-white/8 bg-slate-50/80 dark:bg-zinc-900/80">
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-8">No.</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Project Name</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Unit</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Stage</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">Periode</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 whitespace-nowrap">PIC</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Priority</th>
                  <th className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80 dark:divide-white/4">
                {filtered.map((p, idx) => {
                  const pColor = p.priority_color ?? PRIORITY_COLORS[p.priority_code ?? ""] ?? "#94a3b8";
                  const phaseColor = PHASE_COLORS[p.current_phase_code ?? ""] ?? "#64748b";
                  const nameParts = p.project_name.split(" - ");
                  const displayName = nameParts.length > 1 ? nameParts.slice(1).join(" - ") : p.project_name;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-white/3 transition-colors">
                      <td className="px-4 py-3 text-[11px] text-slate-400">{idx + 1}</td>

                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-[12px] font-semibold text-slate-800 dark:text-white line-clamp-2 leading-snug">
                          {displayName}
                        </p>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.unit_code
                          ? <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/8 px-2 py-0.5 rounded">{p.unit_code}</span>
                          : <span className="text-[11px] text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.current_phase_name
                          ? <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${phaseColor}18`, color: phaseColor }}>{p.current_phase_name}</span>
                          : <span className="text-[11px] text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.start_date && p.end_date
                          ? <span className="text-[10px] text-slate-500 dark:text-slate-400">{format(new Date(p.start_date), "MMM yy")} → {format(new Date(p.end_date), "MMM yy")}</span>
                          : <span className="text-[11px] text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {getCurrentPic(p)
                          ? <span className="text-[11px] text-slate-600 dark:text-slate-300">{getCurrentPic(p)}</span>
                          : <span className="text-[11px] text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.priority_name
                          ? <span className="text-[10px] font-bold uppercase" style={{ color: pColor }}>{p.priority_name}</span>
                          : <span className="text-[11px] text-slate-400">—</span>}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                          className="px-3 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[11px] font-bold hover:bg-cyan-500 hover:text-white transition-all shadow-sm"
                        >
                          Details
                        </button>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectListPage() {
  return (
    <Suspense>
      <ProjectListContent />
    </Suspense>
  );
}
