"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, ArrowRight, CalendarDays } from "lucide-react";
import DateRangePicker from "@/components/dashboard/DateRangePicker";

type DBProject = {
  id: string;
  project_name: string;
  start_date: string | null;
  end_date: string | null;
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
  unit_code: string | null;
  priority_name: string | null;
  priority_color: string | null;
  current_phase_name: string | null;
  overall_progress_pct: string | null;
};

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<DBProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>(() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("projects_dateRange") : null;
      return saved ? JSON.parse(saved) : { start: "", end: "" };
    } catch { return { start: "", end: "" }; }
  });

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDateRangeChange = (range: { start: string; end: string }) => {
    setDateRange(range);
    try { localStorage.setItem("projects_dateRange", JSON.stringify(range)); } catch { /* ignore */ }
  };

  const rangeStart = useMemo(() => toDate(dateRange.start), [dateRange.start]);
  const rangeEnd   = useMemo(() => toDate(dateRange.end),   [dateRange.end]);

  const matchedProjects = useMemo(() => {
    if (!rangeStart || !rangeEnd) return [];
    return projects.filter(p => {
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
  }, [projects, rangeStart, rangeEnd]);

  const hasRange = !!rangeStart && !!rangeEnd;

  const handleViewDetails = () => {
    if (!hasRange) return;
    const params = new URLSearchParams({ start: dateRange.start, end: dateRange.end });
    router.push(`/dashboard/projects/list?${params.toString()}`);
  };

  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <div className="flex items-center gap-2 mt-2">
        <FolderOpen size={16} className="text-cyan-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Projects</h2>
      </div>

      {/* Date range picker card */}
      <div className="glass-card p-6 flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className="text-slate-400" />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Pilih rentang tanggal
          </p>
        </div>

        <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />

        {/* Count + CTA */}
        {hasRange && (
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-200/50 dark:border-white/8">
            <div>
              {loading ? (
                <p className="text-sm text-slate-400">Menghitung proyek...</p>
              ) : (
                <>
                  <p className="text-3xl font-bold text-slate-800 dark:text-white">
                    {matchedProjects.length}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    proyek aktif dalam rentang ini
                  </p>
                </>
              )}
            </div>

            <button
              onClick={handleViewDetails}
              disabled={loading || matchedProjects.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-all shadow-md shadow-cyan-500/20 hover:shadow-cyan-400/30"
            >
              Details
              <ArrowRight size={15} />
            </button>
          </div>
        )}

        {!hasRange && !loading && (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">
            Pilih tanggal mulai dan akhir untuk melihat proyek yang aktif.
          </p>
        )}
      </div>

      {/* Quick stats when no range selected */}
      {!hasRange && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Projects", value: projects.length, color: "text-cyan-500" },
            { label: "Active", value: projects.filter(p => (Number(p.overall_progress_pct) ?? 0) < 95).length, color: "text-blue-500" },
            { label: "Units", value: new Set(projects.map(p => p.unit_code).filter(Boolean)).size, color: "text-purple-500" },
            { label: "Completed", value: projects.filter(p => (Number(p.overall_progress_pct) ?? 0) >= 95).length, color: "text-green-500" },
          ].map(s => (
            <div key={s.label} className="glass-card p-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
