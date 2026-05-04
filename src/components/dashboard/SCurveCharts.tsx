"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Area, ReferenceLine,
} from "recharts";
import { format, addMonths, startOfMonth, differenceInCalendarDays, isBefore, isAfter, getYear } from "date-fns";
import AnimatedDropdown from "./AnimatedDropdown";

// ─── Phase config ───────────────────────────────────────────────────────────
type PhaseKey = "brief" | "design" | "control" | "pm" | "handover";

const PHASES: { key: PhaseKey; label: string; color: string }[] = [
  { key: "brief",    label: "Operational Brief",  color: "#64748b" },
  { key: "design",   label: "Design",             color: "#3b82f6" },
  { key: "control",  label: "Project Control",    color: "#f59e0b" },
  { key: "pm",       label: "Project Management", color: "#14b8a6" },
  { key: "handover", label: "Handover",           color: "#22c55e" },
];

const PHASE_WEIGHT: Record<PhaseKey, number> = {
  brief: 5, design: 15, control: 20, pm: 50, handover: 10,
};

type ViewKey = "overall" | PhaseKey;

const VIEW_OPTIONS: { key: ViewKey; label: string; color: string }[] = [
  { key: "overall",  label: "Overall",            color: "#8b5cf6" },
  ...PHASES,
];

type DBProject = {
  id: string;
  project_name: string;
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
  [key: string]: unknown;
};

interface Props { projects: DBProject[]; }

function toDate(d: string | null): Date | null {
  if (!d) return null;
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
}

// ─── Data builders ──────────────────────────────────────────────────────────
function buildOverallData(projects: DBProject[], yearFilter: string) {
  if (projects.length === 0) return [];

  const allDates: Date[] = [];
  for (const p of projects) {
    [p.start_date, p.end_date, p.brief_received, p.brief_deadline,
     p.design_start, p.design_end, p.control_start, p.control_end,
     p.pm_start, p.pm_end, p.handover_start, p.handover_end]
      .map(toDate).forEach(d => d && allDates.push(d));
  }
  if (allDates.length === 0) return [];

  let minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
  let maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
  if (yearFilter !== "ALL") {
    const y = Number(yearFilter);
    minDate = new Date(y, 0, 1);
    maxDate = new Date(y, 11, 31);
  }

  const months: Date[] = [];
  let m = startOfMonth(minDate);
  while (isBefore(m, addMonths(maxDate, 1))) { months.push(m); m = addMonths(m, 1); }

  const today = new Date();

  return months.map(month => {
    let targetSum = 0, actualSum = 0, count = 0;
    for (const p of projects) {
      const start = toDate(p.start_date) ?? toDate(p.brief_received);
      const end   = toDate(p.end_date)   ?? toDate(p.handover_end) ?? toDate(p.pm_end);
      if (!start || !end) continue;

      const totalDays = Math.max(1, differenceInCalendarDays(end, start));
      const elapsedDays = Math.min(totalDays, Math.max(0, differenceInCalendarDays(month, start)));
      const targetPct = Math.round((elapsedDays / totalDays) * 100);

      let actualPct = 0;
      const phases: { key: PhaseKey; start: string | null; end: string | null; progress: number | null }[] = [
        { key: "brief", start: p.brief_received, end: p.brief_deadline, progress: p.brief_progress },
        { key: "design", start: p.design_start, end: p.design_end, progress: p.design_progress },
        { key: "control", start: p.control_start, end: p.control_end, progress: p.control_progress },
        { key: "pm", start: p.pm_start, end: p.pm_end, progress: p.pm_progress },
        { key: "handover", start: p.handover_start, end: p.handover_end, progress: p.handover_progress },
      ];
      for (const ph of phases) {
        const phS = toDate(ph.start), phE = toDate(ph.end);
        if (!phS || !phE) continue;
        if (!isBefore(month, phE)) actualPct += PHASE_WEIGHT[ph.key];
        else if (!isAfter(month, phS)) actualPct += 0;
        else actualPct += ((ph.progress ?? 0) / 100) * PHASE_WEIGHT[ph.key];
      }

      targetSum += targetPct;
      actualSum += Math.round(actualPct);
      count++;
    }

    return {
      month: format(month, "MMM yyyy"),
      target: count ? Math.round(targetSum / count) : 0,
      actual: count && !isAfter(month, today) ? Math.round(actualSum / count) : null,
    };
  });
}

function buildPhaseData(projects: DBProject[], phaseKey: PhaseKey, yearFilter: string) {
  const startField = phaseKey === "brief" ? "brief_received" : `${phaseKey}_start`;
  const endField   = phaseKey === "brief" ? "brief_deadline" : `${phaseKey}_end`;
  const progField  = `${phaseKey}_progress`;

  const allDates: Date[] = [];
  for (const p of projects) {
    const s = toDate((p as Record<string,any>)[startField]);
    const e = toDate((p as Record<string,any>)[endField]);
    if (s) allDates.push(s);
    if (e) allDates.push(e);
  }
  if (allDates.length === 0) return [];

  let minD = new Date(Math.min(...allDates.map(d => d.getTime())));
  let maxD = new Date(Math.max(...allDates.map(d => d.getTime())));
  if (yearFilter !== "ALL") {
    const y = Number(yearFilter);
    minD = new Date(y, 0, 1);
    maxD = new Date(y, 11, 31);
  }

  const months: Date[] = [];
  let mo = startOfMonth(minD);
  while (isBefore(mo, addMonths(maxD, 1))) { months.push(mo); mo = addMonths(mo, 1); }

  const today = new Date();

  return months.map(month => {
    let targetSum = 0, actualSum = 0, count = 0;
    for (const p of projects) {
      const s = toDate((p as Record<string,any>)[startField]);
      const e = toDate((p as Record<string,any>)[endField]);
      if (!s || !e) continue;

      const total = Math.max(1, differenceInCalendarDays(e, s));
      const elapsed = Math.min(total, Math.max(0, differenceInCalendarDays(month, s)));
      const progress = ((p as Record<string,any>)[progField] as number) ?? 0;
      const actual = !isBefore(month, e) ? 100 : isAfter(month, s) ? progress : 0;

      targetSum += Math.round((elapsed / total) * 100);
      actualSum += actual;
      count++;
    }

    return {
      month: format(month, "MMM yyyy"),
      target: count ? Math.round(targetSum / count) : 0,
      actual: count && !isAfter(month, today) ? Math.round(actualSum / count) : null,
    };
  });
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  const unique = payload.filter((p: any) => { if (seen.has(p.dataKey)) return false; seen.add(p.dataKey); return true; });
  return (
    <div className="rounded-xl border border-white/10 px-3 py-2 shadow-xl"
      style={{ backgroundColor: "rgba(11,15,26,0.96)", backdropFilter: "blur(12px)" }}>
      <p className="text-[10px] font-bold text-white/50 mb-1">{label}</p>
      {unique.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-white/60 capitalize">{p.name ?? p.dataKey}:</span>
          <span className="font-bold text-white">{p.value !== null ? `${p.value}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function SCurveCharts({ projects }: Props) {
  const [activeView, setActiveView] = useState<ViewKey>("overall");
  const [yearFilter, setYearFilter] = useState("ALL");

  // Build available years from project data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const p of projects) {
      [p.start_date, p.end_date, p.brief_received, p.brief_deadline,
       p.design_start, p.design_end, p.control_start, p.control_end,
       p.pm_start, p.pm_end, p.handover_start, p.handover_end]
        .map(toDate).forEach(d => d && years.add(getYear(d)));
    }
    return Array.from(years).sort();
  }, [projects]);

  const yearOptions = useMemo(() => [
    { value: "ALL", label: "All Years" },
    ...availableYears.map(y => ({ value: String(y), label: String(y) })),
  ], [availableYears]);

  const viewOptions = useMemo(() =>
    VIEW_OPTIONS.map(o => ({ value: o.key, label: o.label, color: o.color })),
  []);

  const overallData = useMemo(() => buildOverallData(projects, yearFilter), [projects, yearFilter]);
  const phaseDataMap = useMemo(() => {
    const map: Record<PhaseKey, ReturnType<typeof buildPhaseData>> = {} as any;
    for (const ph of PHASES) map[ph.key] = buildPhaseData(projects, ph.key, yearFilter);
    return map;
  }, [projects, yearFilter]);

  const todayLabel = format(new Date(), "MMM yyyy");

  if (projects.length === 0) return null;

  const currentOption = VIEW_OPTIONS.find(v => v.key === activeView)!;
  const chartData = activeView === "overall" ? overallData : phaseDataMap[activeView as PhaseKey];
  const targetColor = activeView === "overall" ? "#3b82f6" : currentOption.color;
  const actualColor = activeView === "overall" ? "#22c55e" : currentOption.color;

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm p-5">
      {/* Header + Dropdowns */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">
            S-Curve — Target vs Actual
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {activeView === "overall"
              ? `Weighted aggregate across ${projects.length} projects`
              : `${currentOption.label} phase progress`
            }
            {yearFilter !== "ALL" && ` · ${yearFilter}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Phase / View dropdown */}
          <AnimatedDropdown
            value={activeView}
            options={viewOptions}
            onChange={v => setActiveView(v as ViewKey)}
            minWidth={180}
            align="right"
          />
          {/* Year dropdown */}
          <AnimatedDropdown
            value={yearFilter}
            options={yearOptions}
            onChange={setYearFilter}
            minWidth={130}
            align="right"
          />
        </div>
      </div>

      {/* Chart */}
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <defs>
              <linearGradient id="scTargetGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={targetColor} stopOpacity={0.13} />
                <stop offset="95%" stopColor={targetColor} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="scActualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={actualColor} stopOpacity={0.13} />
                <stop offset="95%" stopColor={actualColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine x={todayLabel} stroke="#f59e0b" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "Today", position: "top", fill: "#f59e0b", fontSize: 9 }} />
            <Area type="monotone" dataKey="target" fill="url(#scTargetGrad)" stroke="none" legendType="none" tooltipType="none" />
            <Area type="monotone" dataKey="actual" fill="url(#scActualGrad)" stroke="none" legendType="none" tooltipType="none" />
            <Line type="monotone" dataKey="target" stroke={targetColor} strokeWidth={2} dot={false} strokeDasharray="6 3" name="Target" strokeOpacity={0.7} />
            <Line type="monotone" dataKey="actual" stroke={actualColor} strokeWidth={2.5} dot={false} connectNulls name="Actual" />
            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
