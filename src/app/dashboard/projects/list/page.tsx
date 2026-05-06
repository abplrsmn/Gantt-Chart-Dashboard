"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Search } from "lucide-react";
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
  status_color: string | null;
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
};

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

export default function ProjectListPage() {
  const router = useRouter();
  const params = useSearchParams();
  const startParam = params.get("start") ?? "";
  const endParam   = params.get("end")   ?? "";

  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");

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
    const inRange = projects.filter(p => {
      if (!rangeStart || !rangeEnd) return true;
      const dates = [
        p.brief_received, p.brief_deadline,
        p.design_start, p.design_end,
        p.control_start, p.control_end,
        p.pm_start, p.pm_end,
        p.handover_start, p.handover_end,
        p.start_date, p.end_date,
      ].map(toDate).filter((d): d is Date => d !== null);
      if (dates.length === 0) return false;
      const pMin = new Date(Math.min(...dates.map(d => d.getTime())));
      const pMax = new Date(Math.max(...dates.map(d => d.getTime())));
      return pMin <= rangeEnd && pMax >= rangeStart;
    });

    if (!search.trim()) return inRange;
    const q = search.toLowerCase();
    return inRange.filter(p =>
      [p.project_name, p.project_code, p.unit_code, p.current_phase_name, p.status_label]
        .join(" ").toLowerCase().includes(q)
    );
  }, [projects, rangeStart, rangeEnd, search]);

  const rangeLabel = rangeStart && rangeEnd
    ? `${format(rangeStart, "dd MMM yyyy")} – ${format(rangeEnd, "dd MMM yyyy")}`
    : "All Projects";

  return (
    <div className="space-y-5 pb-8 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm shrink-0"
        >
          <ArrowLeft size={16} className="text-slate-600 dark:text-gray-300" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Projects in Range</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{rangeLabel}</p>
        </div>
        <span className="ml-auto text-xs font-semibold text-slate-500 dark:text-slate-400">
          {loading ? "…" : filtered.length} projects
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search project, unit, phase…"
          className="w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30 text-slate-800 dark:text-white"
        />
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-16 text-center text-sm text-slate-400">
          Tidak ada proyek dalam rentang ini.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => {
            const progress = Number(p.overall_progress_pct ?? 0);
            const pColor = p.priority_color ?? PRIORITY_COLORS[p.priority_code ?? ""] ?? "#94a3b8";
            const phaseColor = PHASE_COLORS[p.current_phase_code ?? ""] ?? "#64748b";

            return (
              <button
                key={p.id}
                onClick={() => {
                  const qs = new URLSearchParams({ start: startParam, end: endParam });
                  router.push(`/dashboard/projects/${p.id}?${qs.toString()}`);
                }}
                className="w-full text-left glass-card p-4 flex items-center gap-4 hover:border-cyan-500/30 hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-all group"
              >
                {/* Priority dot */}
                <div
                  className="w-1.5 shrink-0 self-stretch rounded-full"
                  style={{ backgroundColor: pColor }}
                />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {p.unit_code && (
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/8 px-1.5 py-0.5 rounded">
                        {p.unit_code}
                      </span>
                    )}
                    {p.priority_name && (
                      <span className="text-[10px] font-bold uppercase" style={{ color: pColor }}>
                        {p.priority_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white leading-snug line-clamp-1 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">
                    {p.project_name}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{p.project_code}</p>
                </div>

                {/* Phase + progress */}
                <div className="shrink-0 text-right">
                  {p.current_phase_name && (
                    <span
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${phaseColor}18`, color: phaseColor }}
                    >
                      {p.current_phase_name}
                    </span>
                  )}
                  <div className="mt-1.5 w-24">
                    <div className="h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${progress}%`, backgroundColor: phaseColor }}
                      />
                    </div>
                    <p className="text-[10px] text-right text-slate-500 dark:text-slate-400 mt-0.5 font-semibold">
                      {progress}%
                    </p>
                  </div>
                </div>

                <ChevronRight size={14} className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-cyan-500 transition-colors" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
