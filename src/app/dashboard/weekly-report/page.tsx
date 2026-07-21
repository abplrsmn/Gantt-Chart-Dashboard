"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, addDays, parseISO, isValid, getISOWeek, getISOWeekYear, startOfISOWeek, eachWeekOfInterval } from "date-fns";
import { BarChart2, Search, CalendarRange, ArrowRight, Camera, MapPin, User } from "lucide-react";
import { PHASE_COLORS, DEFAULT_PHASE_COLOR } from "@/lib/phases";
import WeekPicker from "@/components/dashboard/WeekPicker";

type ProjectMeta = {
  id: string;
  project_code: string;
  project_name: string;
  unit_name: string | null;
  unit_code: string | null;
  priority_name: string | null;
  priority_color: string | null;
  status_label: string | null;
  status_color: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  pm_start: string | null;
  pm_end: string | null;
  start_date: string | null;
  end_date: string | null;
  brief_pic: string | null;
  design_pic: string | null;
  control_pic: string | null;
  pm_pic: string | null;
  handover_pic: string | null;
  [key: string]: unknown;
};


function nowWIB(): Date {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60_000;
  return new Date(utc + 7 * 3_600_000);
}

function toWeekInputValue(date: Date): string {
  const year = getISOWeekYear(date);
  const week = getISOWeek(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function weekInputToMonday(val: string): Date | null {
  const m = val.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  const jan4 = new Date(year, 0, 4);
  const jan4dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4dow - 1) + (week - 1) * 7);
  return monday;
}

function weekKeyFromDate(monday: Date): string {
  return `week-${format(monday, "yyyy-MM-dd")}`;
}

function buildWeeks(startRaw: string | null, endRaw: string | null) {
  const start = startRaw ? parseISO(startRaw) : null;
  const end   = endRaw   ? parseISO(endRaw)   : null;
  if (!start || !isValid(start) || !end || !isValid(end) || start > end) return [];
  return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map((mon, i) => {
    const sun = addDays(mon, 6);
    return {
      week: i + 1,
      weekKey: `week-${format(mon, "yyyy-MM-dd")}`,
      range: `${format(mon, "d MMM")} – ${format(sun > end ? end : sun, "d MMM")}`,
    };
  });
}

function getCurrentPic(p: ProjectMeta): string | null {
  const map: Record<string, string | null> = {
    operational_brief:  p.brief_pic,
    design:             p.design_pic,
    project_control:    p.control_pic,
    project_management: p.pm_pic,
    handover:           p.handover_pic,
  };
  return (p.current_phase_code && map[p.current_phase_code]) || null;
}

function fmtShort(dateStr: string | null): string {
  if (!dateStr) return "";
  const d = parseISO(dateStr);
  return isValid(d) ? format(d, "d MMM yyyy") : "";
}

export default function WeeklyReportPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState("");
  const [selectedWeekVal, setSelectedWeekVal] = useState(() => toWeekInputValue(nowWIB()));
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const wibWeek = toWeekInputValue(nowWIB());
      setSelectedWeekVal(prev => prev === toWeekInputValue(nowWIB()) ? wibWeek : prev);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => { if (json.success) setProjects(json.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedMonday  = weekInputToMonday(selectedWeekVal) ?? startOfISOWeek(nowWIB());
  const selectedWeekKey = weekKeyFromDate(selectedMonday);
  const selectedWeekLabel = `${format(selectedMonday, "d MMM")} – ${format(addDays(selectedMonday, 6), "d MMM yyyy")}`;

  const allPics = (p: ProjectMeta) =>
    [p.brief_pic, p.design_pic, p.control_pic, p.pm_pic, p.handover_pic].filter(Boolean).join(" ");

  const filtered = projects.filter(p =>
    !search.trim() ||
    [p.project_name, p.project_code, p.unit_name, p.unit_code, p.status_label, p.current_phase_name, allPics(p)]
      .filter(Boolean).join(" ").toLowerCase().includes(search.toLowerCase())
  );

  const filteredWithWeek = filtered.filter(p => {
    const start = p.pm_start ?? p.start_date;
    const end   = p.pm_end   ?? p.end_date;
    return buildWeeks(start, end).some(w => w.weekKey === selectedWeekKey);
  });

  function goToProject(projectId: string) {
    router.push(`/dashboard/weekly-report/${projectId}?week=${selectedWeekVal}`);
  }

  return (
    <div className="space-y-5 pb-12 animate-page-enter">
      {/* Header */}
      <div className="flex items-center gap-3 mt-2 justify-between flex-wrap">
        <div className="flex items-center gap-2">
          <BarChart2 size={16} className="text-amber-500" />
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Weekly Report</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WeekPicker value={selectedWeekVal} onChange={setSelectedWeekVal} />
          <label className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search project, PIC, unit..."
              className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white w-56 focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 transition-all"
            />
          </label>
        </div>
      </div>

      {/* Week label */}
      <div className="flex items-center gap-2">
        <Camera size={14} className="text-amber-500 shrink-0" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{selectedWeekLabel}</span>
        {!loading && (
          <span className="ml-1 text-[11px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full">
            {filteredWithWeek.length} project{filteredWithWeek.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Project cards */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
        </div>
      ) : filteredWithWeek.length === 0 ? (
        <div className="glass-card p-12 text-center text-sm text-slate-400 dark:text-slate-600">
          {search ? "No projects match your search for this week." : "No projects scheduled for this week."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredWithWeek.map(p => {
            const phaseColor = PHASE_COLORS[p.current_phase_code ?? ""] ?? "#94a3b8";
            const pic = getCurrentPic(p);
            const start = p.pm_start ?? p.start_date;
            const end   = p.pm_end   ?? p.end_date;

            return (
              <button
                key={p.id}
                onClick={() => goToProject(p.id)}
                className="group text-left rounded-xl border border-slate-200/70 dark:border-white/8 bg-white/80 dark:bg-zinc-900/60 overflow-hidden flex flex-col card-hover cursor-pointer"
              >
                {/* Phase color bar */}
                <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: phaseColor }} />

                {/* Body — grows to fill height */}
                <div className="p-4 flex flex-col flex-1">
                  {/* Name + arrow */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-white leading-snug truncate">
                        {p.project_name}
                      </p>
                    </div>
                    <ArrowRight size={14} className="text-slate-300 dark:text-slate-600 transition-all shrink-0 mt-0.5" />
                  </div>

                  {/* Pills */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {p.current_phase_name && (
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white leading-tight" style={{ backgroundColor: phaseColor }}>
                        {p.current_phase_name}
                      </span>
                    )}
                  </div>

                  {/* Meta — grows to push footer down */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-h-4">
                      <MapPin size={10} className="shrink-0 text-slate-400" />
                      <span className="truncate">{p.unit_name ?? <span className="text-slate-300 dark:text-slate-700">—</span>}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 min-h-4">
                      <User size={10} className="shrink-0 text-slate-400" />
                      <span className="truncate">{pic ?? <span className="text-slate-300 dark:text-slate-700">—</span>}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 min-h-4">
                      <CalendarRange size={10} className="shrink-0" />
                      <span>{start ? `${fmtShort(start)}${end && end !== start ? ` – ${fmtShort(end)}` : ""}` : <span className="text-slate-300 dark:text-slate-700">—</span>}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
