"use client";

import { useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Area, ReferenceLine,
} from "recharts";
import {
  format, differenceInCalendarDays, isAfter,
  startOfWeek, endOfWeek, addWeeks, addDays,
} from "date-fns";
import { Activity } from "lucide-react";
import AnimatedDropdown from "./AnimatedDropdown";

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

interface Props { projects: DBProject[]; }

type SCurvePoint = { month: string; target: number; actual: number | null };

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
function buildSingleProjectData(p: DBProject): { points: SCurvePoint[]; tasks: SubTask[] } {
  const projectStart = toDate(p.start_date) ?? toDate(p.brief_received) ?? new Date();
  const projectEnd   = toDate(p.end_date)   ?? toDate(p.handover_end)   ?? toDate(p.pm_end) ?? addWeeks(projectStart, 12);
  const totalProjectDays = Math.max(1, differenceInCalendarDays(projectEnd, projectStart));

  const phaseMeta = [
    { id: "brief",    name: "Operational Brief",  weight: 10, oS: 0,  oE: 10,  s: toDate(p.brief_received),  e: toDate(p.brief_deadline),  progress: Number(p.brief_progress   ?? 0) },
    { id: "design",   name: "Design",             weight: 20, oS: 10, oE: 30,  s: toDate(p.design_start),    e: toDate(p.design_end),      progress: Number(p.design_progress  ?? 0) },
    { id: "control",  name: "Project Control",    weight: 15, oS: 30, oE: 45,  s: toDate(p.control_start),   e: toDate(p.control_end),     progress: Number(p.control_progress ?? 0) },
    { id: "pm",       name: "Project Management", weight: 45, oS: 45, oE: 90,  s: toDate(p.pm_start),        e: toDate(p.pm_end),          progress: Number(p.pm_progress      ?? 0) },
    { id: "handover", name: "Handover",           weight: 10, oS: 90, oE: 100, s: toDate(p.handover_start),  e: toDate(p.handover_end),    progress: Number(p.handover_progress ?? 0) },
  ];

  const tasks: SubTask[] = phaseMeta.map(ph => {
    const defaultStart = addDays(projectStart, Math.round((ph.oS / 100) * totalProjectDays));
    const defaultEnd   = addDays(projectStart, Math.round((ph.oE / 100) * totalProjectDays));
    const start = ph.s ?? (ph.e ? addDays(ph.e, -14) : defaultStart);
    const end   = ph.e ?? (ph.s ? addDays(ph.s, 14) : defaultEnd);
    return { id: ph.id, name: ph.name, weight: ph.weight, start, end, progress: ph.progress };
  }).filter(t => differenceInCalendarDays(t.end, t.start) >= 0);

  if (tasks.length === 0) return { points: [], tasks: [] };

  const timelineStart = tasks.reduce((m, t) => t.start < m ? t.start : m, tasks[0].start);
  const timelineEnd   = tasks.reduce((m, t) => t.end   > m ? t.end   : m, tasks[0].end);

  const points: SCurvePoint[] = [];
  let cursor = startOfWeek(timelineStart, { weekStartsOn: 1 });
  const today = new Date();

  while (cursor <= endOfWeek(timelineEnd, { weekStartsOn: 1 })) {
    let targetSum = 0;
    let actualSum = 0;
    for (const t of tasks) {
      const duration   = Math.max(1, differenceInCalendarDays(t.end, t.start));
      const daysTarget = Math.min(duration, Math.max(0, differenceInCalendarDays(cursor, t.start)));
      targetSum += (daysTarget / duration) * t.weight;
      if (!isAfter(cursor, today)) {
        const daysActual   = Math.min(duration, Math.max(0, differenceInCalendarDays(cursor, t.start)));
        const expectedPct  = (daysActual / duration) * 100;
        actualSum += (Math.min(expectedPct, t.progress) / 100) * t.weight;
      }
    }
    points.push({
      month:  format(cursor, "dd MMM yy"),
      target: Number(targetSum.toFixed(2)),
      actual: !isAfter(cursor, today) ? Number(actualSum.toFixed(2)) : null,
    });
    cursor = addWeeks(cursor, 1);
  }

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
    <div className="rounded-xl border border-white/10 px-3 py-2 shadow-xl"
      style={{ backgroundColor: "rgba(11,15,26,0.96)", backdropFilter: "blur(12px)" }}>
      <p className="text-[10px] font-bold text-white/50 mb-1">{label}</p>
      {unique.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-white/60 capitalize">{p.name ?? p.dataKey}:</span>
          <span className="font-bold text-white">{p.value !== null ? `${p.value}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SCurveCharts({ projects }: Props) {
  const [selectedUnit, setSelectedUnit]           = useState<string>("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

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

  const { points: chartData } = useMemo(() => {
    if (!selectedProject) return { points: [], tasks: [] };
    return buildSingleProjectData(selectedProject);
  }, [selectedProject]);

  const tahapGroups = useMemo(() => {
    if (!selectedProject) return [];
    return generateTahap(selectedProject.id);
  }, [selectedProject]);

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
          {/* ── Keterangan + S-Curve ─────────────────────────────────────── */}
          <div className="flex flex-col lg:flex-row gap-0 border border-slate-200/60 dark:border-white/10 rounded-xl overflow-hidden">

            {/* Keterangan table */}
            {tahapGroups.length > 0 && (
              <div className="w-full lg:w-[280px] shrink-0 flex flex-col border-r border-slate-200/60 dark:border-white/10 bg-slate-50/30 dark:bg-black/20">
                {/* Column headers */}
                <div className="h-9 shrink-0 border-b border-slate-200/60 dark:border-white/10 flex bg-slate-100/60 dark:bg-zinc-900/60">
                  <div className="flex-1 px-3 flex items-center text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Keterangan
                  </div>
                  <div className="w-[72px] shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                    Bobot (%)
                  </div>
                </div>

                {/* Rows */}
                <div className="flex-1 overflow-y-auto divide-y divide-slate-200/40 dark:divide-white/5">
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
                          <div className={`flex-1 flex items-center truncate text-slate-700 dark:text-slate-200 ${group.header ? "px-3 pl-6" : "px-3"}`}
                            title={item.name}>
                            {item.name}
                          </div>
                          <div className="w-[72px] shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center font-mono text-slate-500 dark:text-slate-400">
                            {item.bobot.toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

                {/* Total row */}
                <div className="h-9 shrink-0 flex text-[10px] font-bold border-t border-slate-200/60 dark:border-white/10 bg-slate-200/30 dark:bg-zinc-800/40">
                  <div className="flex-1 px-3 flex items-center text-slate-800 dark:text-white uppercase tracking-wider">
                    Total
                  </div>
                  <div className="w-[72px] shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                    100.00
                  </div>
                </div>
              </div>
            )}

            {/* S-Curve chart */}
            <div className="flex-1 min-w-0 min-h-90 bg-zinc-950/20">
              <ResponsiveContainer width="100%" height="100%" minHeight={360}>
                <ComposedChart data={chartData} margin={{ top: 36, right: 12, bottom: 36, left: 0 }}>
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
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
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
          {selectedProject && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {PHASE_DEFS.map(ph => {
                const progress = Number(selectedProject[ph.progressKey] ?? 0);
                return (
                  <div
                    key={ph.key}
                    className="rounded-xl border border-white/8 bg-zinc-900/50 p-3 flex flex-col gap-2.5"
                    style={{ borderColor: ph.color + "30" }}
                  >
                    {/* Phase label */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ph.color }} />
                      <span className="text-[9px] font-extrabold uppercase tracking-wider text-white/80">
                        {ph.label}
                      </span>
                    </div>

                    {/* Dates */}
                    <div className="flex flex-col gap-0.5 text-[10px]">
                      <div className="flex justify-between gap-1">
                        <span className="text-white/40">Start</span>
                        <span className="text-white/80 font-medium text-right">{fmtDate(selectedProject[ph.startKey])}</span>
                      </div>
                      <div className="flex justify-between gap-1">
                        <span className="text-white/40">End</span>
                        <span className="text-white/80 font-medium text-right">{fmtDate(selectedProject[ph.endKey])}</span>
                      </div>
                      <div className="flex justify-between gap-1 mt-0.5">
                        <span className="text-white/40">Bobot</span>
                        <span className="font-bold" style={{ color: ph.color }}>{ph.weight}%</span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-[9px] mb-1">
                        <span className="text-white/30 uppercase tracking-wider">Progress</span>
                        <span className="font-bold" style={{ color: ph.color }}>{progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                        <div
                          className="h-full rounded-full"
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
