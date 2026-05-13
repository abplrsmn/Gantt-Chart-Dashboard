"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Area, ReferenceLine,
} from "recharts";
import {
  format, differenceInCalendarDays, isAfter,
  addWeeks, addDays,
} from "date-fns";
import { Activity } from "lucide-react";
import AnimatedDropdown from "./AnimatedDropdown";
import QuickMenu from "./QuickMenu";

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "admin";
  const match = document.cookie.match(/(?:^|;\s*)user_role=([^;]+)/);
  return match ? match[1].trim() : "admin";
}

// ─── Types ────────────────────────────────────────────────────────────────────
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
  unit_name: string | null;
  unit_code: string | null;
  overall_progress_pct: string | null;
};

interface Props { projects: DBProject[]; hidePhaseDetails?: boolean; }

type SCurvePoint = { month: string; target: number; actual: number | null };

function pushUniquePoint(points: SCurvePoint[], point: SCurvePoint) {
  const last = points[points.length - 1];
  if (last?.month === point.month) {
    points[points.length - 1] = point;
  } else {
    points.push(point);
  }
}

interface SubTask {
  id: string;
  name: string;
  weight: number;
  start: Date;
  end: Date;
  progress: number;
}

type TahapItem = { name: string; bobot: number };
type TahapGroup = { header: string | null; color: string | null; items: TahapItem[] };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const p = new Date(d);
  return isNaN(p.getTime()) ? null : p;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const p = new Date(d);
  return isNaN(p.getTime()) ? "—" : format(p, "dd MMM yyyy");
}

// ─── Tahap generation (deterministic per project) ────────────────────────────
const WORK_POOLS: string[][] = [
  ["Penampalan Retakan", "Pengecatan", "Silikon Jendela"],
  ["Pemasangan Keramik", "Plafon Gypsum", "Instalasi Listrik"],
  ["Instalasi Plumbing", "Pekerjaan Sipil", "Finishing Interior"],
  ["Waterproofing", "Pemasangan Partisi", "MEP Works"],
  ["Structural Work", "Landscaping", "Pengecatan Ulang"],
  ["Pembongkaran", "Fabrikasi", "Instalasi Unit"],
];

const TAHAP_COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#8b5cf6", "#3b82f6", "#06b6d4"];

function hashStr(s: string): number {
  let h = 0;
  for (const c of s) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function generateTahap(projectId: string): TahapGroup[] {
  const seed = hashStr(projectId);
  const numTahap = 3 + (seed % 4); // 3–6 tahap
  const middle = 80;
  const base = Math.round((middle / numTahap) * 100) / 100;

  const groups: TahapGroup[] = [
    { header: null, color: null, items: [{ name: "Persiapan dan Setting", bobot: 10.00 }] },
  ];

  let weightLeft = middle;
  for (let t = 0; t < numTahap; t++) {
    const pool = WORK_POOLS[(seed + t) % WORK_POOLS.length];
    const isLast = t === numTahap - 1;
    const total = isLast ? Math.round(weightLeft * 100) / 100 : base;
    if (!isLast) weightLeft = Math.round((weightLeft - base) * 100) / 100;

    const w1 = Math.round(total * 0.25 * 100) / 100;
    const w2 = Math.round(total * 0.50 * 100) / 100;
    const w3 = Math.round((total - w1 - w2) * 100) / 100;

    groups.push({
      header: `Tahap ${t + 1}`,
      color: TAHAP_COLORS[t % TAHAP_COLORS.length],
      items: [
        { name: pool[0], bobot: w1 },
        { name: pool[1], bobot: w2 },
        { name: pool[2], bobot: w3 },
      ],
    });
  }

  groups.push({ header: null, color: null, items: [{ name: "Pembersihan Lokasi", bobot: 10.00 }] });
  return groups;
}

// ─── Phase definitions ────────────────────────────────────────────────────────
const PHASE_DEFS = [
  {
    key: "brief", label: "Operational Brief", color: "#64748b", weight: 10,
    startKey: "brief_received" as const, endKey: "brief_deadline" as const,
    progressKey: "brief_progress" as const,
  },
  {
    key: "design", label: "Design", color: "#3b82f6", weight: 20,
    startKey: "design_start" as const, endKey: "design_end" as const,
    progressKey: "design_progress" as const,
  },
  {
    key: "control", label: "Project Control", color: "#f59e0b", weight: 15,
    startKey: "control_start" as const, endKey: "control_end" as const,
    progressKey: "control_progress" as const,
  },
  {
    key: "pm", label: "Project Management", color: "#14b8a6", weight: 45,
    startKey: "pm_start" as const, endKey: "pm_end" as const,
    progressKey: "pm_progress" as const,
  },
  {
    key: "handover", label: "Handover", color: "#22c55e", weight: 10,
    startKey: "handover_start" as const, endKey: "handover_end" as const,
    progressKey: "handover_progress" as const,
  },
] as const;

// ─── S-Curve builder ──────────────────────────────────────────────────────────
// Uses actual tahap bobot values distributed proportionally across the project timeline.
// Items are ordered top→bottom (Persiapan first, Pembersihan Lokasi last).
// Actual progress is sourced from the phase window each item falls within.
function buildSingleProjectData(
  p: DBProject,
  tahapGroups: TahapGroup[]
): { points: SCurvePoint[]; tasks: SubTask[] } {
  const projectStart = toDate(p.start_date) ?? toDate(p.brief_received) ?? new Date();
  const projectEnd   = toDate(p.end_date)   ?? toDate(p.handover_end)   ?? toDate(p.pm_end) ?? addWeeks(projectStart, 12);
  const totalProjectDays = Math.max(1, differenceInCalendarDays(projectEnd, projectStart));

  // Phase progress data — used to assign actual progress to items by time position
  const phaseWindows = [
    { oS: 0,  oE: 10,  progress: Number(p.brief_progress   ?? 0) },
    { oS: 10, oE: 30,  progress: Number(p.design_progress  ?? 0) },
    { oS: 30, oE: 45,  progress: Number(p.control_progress ?? 0) },
    { oS: 45, oE: 90,  progress: Number(p.pm_progress      ?? 0) },
    { oS: 90, oE: 100, progress: Number(p.handover_progress ?? 0) },
  ];

  // Flatten all items in table order (top = earliest, bottom = latest)
  const allItems: { bobot: number }[] = [];
  for (const group of tahapGroups) {
    for (const item of group.items) allItems.push({ bobot: item.bobot });
  }
  const totalBobot = allItems.reduce((s, i) => s + i.bobot, 0) || 100;

  // Build SubTask list — each item occupies a proportional slice of the timeline
  // Items are spread sequentially: item at cumulative-bobot position maps to that % of project time
  const tasks: SubTask[] = [];
  let cumulBobot = 0;
  allItems.forEach((item, idx) => {
    const startRatio = cumulBobot / totalBobot;
    cumulBobot += item.bobot;
    const endRatio = cumulBobot / totalBobot;
    const start = addDays(projectStart, Math.round(startRatio * totalProjectDays));
    const end   = addDays(projectStart, Math.round(endRatio   * totalProjectDays));
    // Actual progress from whichever phase covers the midpoint of this item
    const midRatio = ((startRatio + endRatio) / 2) * 100;
    const pw = phaseWindows.find(w => midRatio >= w.oS && midRatio < w.oE) ?? phaseWindows[phaseWindows.length - 1];
    tasks.push({ id: String(idx), name: `Item ${idx + 1}`, weight: item.bobot, start, end, progress: pw.progress });
  });

  if (tasks.length === 0) return { points: [], tasks: [] };

  const points: SCurvePoint[] = [];
  let cursor = projectStart;
  const today = new Date();

  const buildPoint = (pointDate: Date): SCurvePoint => {
    let targetSum = 0;
    let actualSum = 0;
    for (const t of tasks) {
      const duration   = Math.max(1, differenceInCalendarDays(t.end, t.start));
      const daysTarget = Math.min(duration, Math.max(0, differenceInCalendarDays(pointDate, t.start)));
      targetSum += (daysTarget / duration) * t.weight;
      if (!isAfter(pointDate, today)) {
        const daysActual  = Math.min(duration, Math.max(0, differenceInCalendarDays(pointDate, t.start)));
        const expectedPct = (daysActual / duration) * 100;
        actualSum += (Math.min(expectedPct, t.progress) / 100) * t.weight;
      }
    }
    return {
      month:  format(pointDate, "dd MMM yy"),
      target: Number(targetSum.toFixed(2)),
      actual: !isAfter(pointDate, today) ? Number(actualSum.toFixed(2)) : null,
    };
  };

  // Keep the S-curve X-axis inside the exact master project range.
  // Do not snap the chart to full calendar weeks; if a project is 12 May–12 Jun,
  // the visible curve should start at 12 May and end at 12 Jun.
  while (cursor < projectEnd) {
    pushUniquePoint(points, buildPoint(cursor));
    cursor = addWeeks(cursor, 1);
  }
  pushUniquePoint(points, buildPoint(projectEnd));

  return { points, tasks };
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
interface TooltipEntry { dataKey: string; name?: string; value: number | null; color: string; }
interface ChartTooltipProps { active?: boolean; payload?: TooltipEntry[]; label?: string; }

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const seen = new Set<string>();
  const unique = payload.filter(p => { if (seen.has(p.dataKey)) return false; seen.add(p.dataKey); return true; });
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 px-3 py-2 shadow-xl bg-white/95 dark:bg-zinc-950/96 backdrop-blur-xl">
      <p className="text-[10px] font-bold text-slate-500 dark:text-white/50 mb-1">{label}</p>
      {unique.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500 dark:text-white/60 capitalize">{p.name ?? p.dataKey}:</span>
          <span className="font-bold text-slate-900 dark:text-white">{p.value !== null ? `${p.value}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SCurveCharts({ projects, hidePhaseDetails }: Props) {
  const [selectedUnit, setSelectedUnit]           = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [userRole, setUserRole]                   = useState<string>("admin");

  useEffect(() => { setUserRole(getRoleFromCookie()); }, []);

  const unitOptions = useMemo(() => {
    const units = Array.from(new Set(projects.map(p => p.unit_code).filter(Boolean))).sort() as string[];
    return [
      { value: "", label: "Select Unit Name" },
      ...units.map(u => ({ value: u, label: u })),
    ];
  }, [projects]);

  const projectOptions = useMemo(() => {
    if (!selectedUnit) return [{ value: "", label: "Select Project Name" }];
    return [
      { value: "", label: "Select Project Name" },
      ...projects
        .filter(p => p.unit_code === selectedUnit)
        .map(p => {
          const parts = p.project_name.split(" - ");
          const name  = parts.length > 1 ? parts.slice(1).join(" - ") : p.project_name;
          return { value: p.id, label: name };
        }),
    ];
  }, [projects, selectedUnit]);

  const selectedProject = useMemo(() => {
    if (projects.length === 1) return projects[0];
    if (selectedProjectId) return projects.find(x => x.id === selectedProjectId) ?? null;
    return null;
  }, [projects, selectedProjectId]);

  const tahapGroups = useMemo(() => {
    if (!selectedProject) return [];
    return generateTahap(selectedProject.id);
  }, [selectedProject]);

  // ── Fetch S-curve data from DB (periods first, phase fallback) ──────────────
  const [chartData, setChartData] = useState<SCurvePoint[]>([]);
  const [scurveSource, setScurveSource] = useState<"periods" | "phases" | null>(null);

  useEffect(() => {
    if (!selectedProject) { setChartData([]); return; }
    let cancelled = false;

    fetch(`/api/projects/${selectedProject.id}/scurve`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (!json.success) return;

        if (json.source === "periods") {
          // Real granular period data from project_task_progress_periods
          setChartData(json.data);
          setScurveSource("periods");
        } else {
          // Fallback: build from phase-level DB data
          const pts = buildSingleProjectData(selectedProject, tahapGroups);
          setChartData(pts.points);
          setScurveSource("phases");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Network error: still build from phase data client-side
        const pts = buildSingleProjectData(selectedProject, tahapGroups);
        setChartData(pts.points);
        setScurveSource("phases");
      });

    return () => { cancelled = true; };
  }, [selectedProject, tahapGroups]);

  // Compute exact chart height to match table height so Y=0% aligns with "Pembersihan Lokasi"
  // h-9 = 36px (header), h-6 = 24px (group header), h-8 = 32px (item row), h-9 = 36px (total row)
  const chartHeight = useMemo(() => {
    let contentHeight = 0;
    for (const group of tahapGroups) {
      if (group.header) contentHeight += 24;   // h-6 group label
      contentHeight += group.items.length * 32; // h-8 per item
    }
    return 36 + contentHeight + 36; // header-row + content + total-row
  }, [tahapGroups]);

  const todayLabel  = format(new Date(), "dd MMM yy");
  const targetColor = "#3b82f6";
  const actualColor = "#22c55e";

  if (projects.length === 0) return null;

  const needsSelection = projects.length > 1 && (!selectedUnit || !selectedProjectId);

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm p-4 mt-4 overflow-hidden">

      {/* Header + Dropdowns */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-4 bg-cyan-500 rounded-full" />
            Project Performance Analysis
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium uppercase tracking-wider">
            Task Timeline & S-Curve Overlay
          </p>
        </div>

        {projects.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <AnimatedDropdown
              value={selectedUnit}
              options={unitOptions}
              onChange={val => { setSelectedUnit(val); setSelectedProjectId(""); }}
              minWidth={180}
              align="right"
            />
            {userRole === "pm" && <QuickMenu align="right" />}
            <AnimatedDropdown
              value={selectedProjectId}
              options={projectOptions}
              onChange={setSelectedProjectId}
              minWidth={220}
              align="right"
              disabled={!selectedUnit}
            />
          </div>
        )}
      </div>

      {needsSelection ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
          <Activity size={32} className="mb-3 opacity-20" />
          <p className="text-sm font-medium">Please select a Unit and Project</p>
          <p className="text-xs mt-1">S-Curve analysis will appear here</p>
        </div>
      ) : (
        <>
          {/* ── Keterangan (Y-axis) + S-Curve (side-by-side) ──────────── */}
          <div className="flex flex-row gap-0 border border-slate-200/60 dark:border-white/10 rounded-xl overflow-hidden">

            {/* LEFT: Keterangan table — acts as the Y-axis label panel */}
            {tahapGroups.length > 0 && (
              <div className="w-[220px] shrink-0 flex flex-col border-r border-slate-200/60 dark:border-white/10 bg-slate-50/30 dark:bg-black/20">
                {/* Column headers — height matches chart top margin (36px) */}
                <div className="h-9 shrink-0 border-b border-slate-200/60 dark:border-white/10 flex bg-slate-100/60 dark:bg-zinc-900/60">
                  <div className="flex-1 px-3 flex items-center text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Keterangan
                  </div>
                  <div className="w-16 shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Bobot
                  </div>
                </div>

                {/* Rows — this middle section aligns with the chart plot area */}
                <div className="flex-1 divide-y divide-slate-200/40 dark:divide-white/5 flex flex-col">
                  {tahapGroups.map((group, gi) => (
                    <div key={gi}>
                      {group.header && (
                        <div
                          className="h-6 flex items-center px-3"
                          style={{ backgroundColor: group.color + "28" }}
                        >
                          <span className="text-[10px] font-extrabold tracking-wide" style={{ color: group.color ?? undefined }}>
                            {group.header}
                          </span>
                        </div>
                      )}
                      {group.items.map((item, ii) => (
                        <div key={ii} className="h-8 flex text-[11px] hover:bg-slate-100/40 dark:hover:bg-white/4 transition-colors">
                          <div className={`flex-1 flex items-center truncate text-slate-700 dark:text-slate-200 ${group.header ? "px-3 pl-5" : "px-3"}`}
                            title={item.name}>
                            {item.name}
                          </div>
                          <div className="w-16 shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {item.bobot.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Total row — height matches chart bottom margin (36px) */}
                <div className="h-9 shrink-0 flex text-[10px] font-bold border-t border-slate-200/60 dark:border-white/10 bg-slate-200/30 dark:bg-zinc-800/40">
                  <div className="flex-1 px-3 flex items-center text-slate-800 dark:text-white uppercase tracking-wider">
                    Total
                  </div>
                  <div className="w-16 shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                    100.00
                  </div>
                </div>
              </div>
            )}

            {/* RIGHT: S-Curve chart */}
            <div className="flex-1 min-w-0 bg-white dark:bg-zinc-950/30" style={{ minHeight: chartHeight }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <ComposedChart
                  data={chartData}
                  margin={{
                    top: 70,    /* = table header h-9 (36px) */
                    right: 2,
                    bottom: 2, /* = total row (36px) + compensation for first-point Y offset (32px) */
                    left: 0,
                  }}
                >
                  <defs>
                    <linearGradient id="scTargetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={targetColor} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={targetColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="scActualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={actualColor} stopOpacity={0.18} />
                      <stop offset="95%" stopColor={actualColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 9, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, 100]}
                    width={0}
                    hide
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine
                    yAxisId="pct"
                    x={todayLabel}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{ value: "Today", position: "top", fill: "#f59e0b", fontSize: 9 }}
                  />
                  <Area yAxisId="pct" type="monotone" dataKey="target" fill="url(#scTargetGrad)" stroke="none" />
                  <Area yAxisId="pct" type="monotone" dataKey="actual" fill="url(#scActualGrad)" stroke="none" />
                  <Line yAxisId="pct" type="monotone" dataKey="target" stroke={targetColor} strokeWidth={2.5} dot={false} strokeDasharray="6 3" name="Planned" />
                  <Line yAxisId="pct" type="monotone" dataKey="actual" stroke={actualColor} strokeWidth={3.5} dot={false} connectNulls name="Actual" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>


          {/* ── Phase Details ─────────────────────────────────────────────── */}
          {selectedProject && !hidePhaseDetails && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {PHASE_DEFS.map(ph => {
                const progress = Number(selectedProject[ph.progressKey] ?? 0);
                return (
                  <div
                    key={ph.key}
                    className="rounded-2xl border bg-zinc-900/60 p-5 flex flex-col gap-4"
                    style={{ borderColor: ph.color + "40", boxShadow: `0 0 20px ${ph.color}10` }}
                  >
                    {/* Phase label */}
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: ph.color }} />
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-white/90">
                        {ph.label}
                      </span>
                    </div>

                    {/* Dates */}
                    <div className="flex flex-col gap-1.5 text-[11px]">
                      <div className="flex justify-between gap-2">
                        <span className="text-white/40">Start</span>
                        <span className="text-white/80 font-medium text-right">{fmtDate(selectedProject[ph.startKey])}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-white/40">End</span>
                        <span className="text-white/80 font-medium text-right">{fmtDate(selectedProject[ph.endKey])}</span>
                      </div>
                      <div className="flex justify-between gap-2 mt-1 border-t border-white/5 pt-1.5">
                        <span className="text-white/40">Bobot</span>
                        <span className="font-bold text-[12px]" style={{ color: ph.color }}>{ph.weight}%</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-[11px] mb-1.5">
                        <span className="text-white/30 uppercase tracking-wider font-semibold">Progress</span>
                        <span className="font-extrabold text-[13px]" style={{ color: ph.color }}>{progress}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(100, progress)}%`, backgroundColor: ph.color }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}


          {/* ── Legend ───────────────────────────────────────────────────── */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 px-2 pt-4 border-t border-slate-200/40 dark:border-white/5">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 rounded-full" style={{ backgroundColor: targetColor, backgroundImage: "repeating-linear-gradient(90deg,#3b82f6 0,#3b82f6 6px,transparent 6px,transparent 9px)" }} />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Planned Target</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actual Progress</span>
              </div>
            </div>
            <div className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
              Analytical Performance Index
            </div>
          </div>
        </>
      )}
    </div>
  );
}
