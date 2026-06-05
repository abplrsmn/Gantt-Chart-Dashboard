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
import { Activity, Plus, Trash2, Pencil, Check, X } from "lucide-react";
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
  current_phase_code?: string | null;
};

interface Props { projects: DBProject[]; hidePhaseDetails?: boolean; }

type SCurvePoint = { month: string; target: number; actual: number | null; planned_weekly?: number; actual_weekly?: number; variance?: number; is_baseline?: boolean; period_start?: string | null; period_end?: string | null };

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

type TahapItem = { name: string; bobot: number; progress?: number; periods?: { period_order: number; label: string; planned: number; actual: number; actual_pct: number }[] };
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

function getPointDate(point: SCurvePoint): Date | null {
  return toDate(point.period_start ?? undefined);
}

function getMonthLabel(point: SCurvePoint): string {
  const d = getPointDate(point);
  return d ? format(d, "MMM yyyy") : "";
}

function buildMonthWeekHeader(points: SCurvePoint[]) {
  const monthGroups: { label: string; colSpan: number }[] = [];
  const weekLabels: string[] = [];
  const monthCounts = new Map<string, number>();

  for (const point of points.filter(p => !p.is_baseline)) {
    const month = getMonthLabel(point) || "Schedule";
    const nextWeek = (monthCounts.get(month) ?? 0) + 1;
    monthCounts.set(month, nextWeek);
    weekLabels.push(`W${nextWeek}`);

    const last = monthGroups[monthGroups.length - 1];
    if (last && last.label === month) {
      last.colSpan += 1;
    } else {
      monthGroups.push({ label: month, colSpan: 1 });
    }
  }

  return { monthGroups, weekLabels };
}

// ─── DB Task type ─────────────────────────────────────────────────────────────
type DBTask = { id: string; title: string; weight_pct: number; progress_pct: number; item_order: number };
type TaskDraft = { id?: string; title: string; weight_pct: string; progress_pct: string };

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

  // ── Task CRUD state ───────────────────────────────────────────────────────────
  const [dbTasks, setDbTasks]           = useState<DBTask[]>([]);
  const [editingTasks, setEditingTasks] = useState(false);
  const [drafts, setDrafts]             = useState<TaskDraft[]>([]);
  const [saving, setSaving]             = useState(false);

  function loadTasks(projectId: string) {
    fetch(`/api/projects/${projectId}/tasks`)
      .then(r => r.json())
      .then(j => {
        if (j.success) setDbTasks((j.data ?? []).map((t: DBTask) => ({ ...t, weight_pct: Number(t.weight_pct), progress_pct: Number(t.progress_pct) })));
      })
      .catch(() => {});
  }

  useEffect(() => {
    if (!selectedProject) { setDbTasks([]); setEditingTasks(false); return; }
    loadTasks(selectedProject.id);
  }, [selectedProject]);

  function startEdit() {
    setDrafts(dbTasks.map(t => ({ id: t.id, title: t.title, weight_pct: String(t.weight_pct), progress_pct: String(t.progress_pct) })));
    setEditingTasks(true);
  }
  function addDraft() { setDrafts(prev => [...prev, { title: "", weight_pct: "", progress_pct: "0" }]); }
  function removeDraft(idx: number) { setDrafts(prev => prev.filter((_, i) => i !== idx)); }
  function setDraft(idx: number, field: keyof TaskDraft, val: string) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: val } : d));
  }

  async function saveTasks() {
    if (!selectedProject) return;
    setSaving(true);
    try {
      const pid = selectedProject.id;
      const existingIds = new Set(dbTasks.map(t => t.id));
      const draftIds    = new Set(drafts.filter(d => d.id).map(d => d.id!));

      // Delete removed tasks
      for (const t of dbTasks) {
        if (!draftIds.has(t.id)) {
          await fetch(`/api/projects/${pid}/tasks`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: t.id }) });
        }
      }
      // Create or update
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i];
        if (!d.title.trim()) continue;
        const w = Math.max(0, Number(d.weight_pct) || 0);
        const p = Math.min(100, Math.max(0, Number(d.progress_pct) || 0));
        if (d.id && existingIds.has(d.id)) {
          await fetch(`/api/projects/${pid}/tasks`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: d.id, title: d.title.trim(), weight_pct: w, progress_pct: p, item_order: i + 1 }) });
        } else {
          await fetch(`/api/projects/${pid}/tasks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: d.title.trim(), weight_pct: w, progress_pct: p, item_order: i + 1 }) });
        }
      }
      loadTasks(pid);
      setEditingTasks(false);
    } finally {
      setSaving(false);
    }
  }

  // Build tahapGroups from DB tasks for chart calculation
  const generatedTahapGroups = useMemo<TahapGroup[]>(() => {
    if (dbTasks.length === 0) return [];
    return [{ header: null, color: null, items: dbTasks.map(t => ({ name: t.title, bobot: t.weight_pct, progress: t.progress_pct })) }];
  }, [dbTasks]);

  // ── Fetch S-curve data from DB (task/periods first, phase fallback) ─────────
  const [chartData, setChartData] = useState<SCurvePoint[]>([]);
  const [dbTahapGroups, setDbTahapGroups] = useState<TahapGroup[] | null>(null);
  const [scurveSource, setScurveSource] = useState<"tasks" | "periods" | "phases" | null>(null);

  useEffect(() => {
    if (!selectedProject) { setChartData([]); setDbTahapGroups(null); return; }
    let cancelled = false;

    fetch(`/api/projects/${selectedProject.id}/scurve`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        if (!json.success) return;

        if (json.source === "tasks" || json.source === "periods") {
          // Real granular S-curve: task weights + planned/actual period contributions.
          setChartData(json.data);
          setScurveSource(json.source);
          if (Array.isArray(json.tasks)) {
            const colors = ["#64748b", "#3b82f6", "#f59e0b", "#14b8a6", "#22c55e", "#8b5cf6"];
            const grouped = new Map<string, TahapItem[]>();
            for (const task of json.tasks) {
              const phase = task.phase || "Work Items";
              const arr = grouped.get(phase) ?? [];
              arr.push({ name: task.title, bobot: Number(task.weight ?? 0), progress: Number(task.progress ?? 0), periods: task.periods ?? [] });
              grouped.set(phase, arr);
            }
            setDbTahapGroups(Array.from(grouped.entries()).map(([phase, items], idx) => ({
              header: phase,
              color: colors[idx % colors.length],
              items,
            })));
          }
        } else {
          // Fallback: build from phase-level DB data
          const pts = buildSingleProjectData(selectedProject, generatedTahapGroups);
          setChartData(pts.points);
          setDbTahapGroups(null);
          setScurveSource("phases");
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Network error: still build from phase data client-side
        const pts = buildSingleProjectData(selectedProject, generatedTahapGroups);
        setChartData(pts.points);
        setDbTahapGroups(null);
        setScurveSource("phases");
      });

    return () => { cancelled = true; };
  }, [selectedProject, generatedTahapGroups]);

  const tahapGroups = dbTahapGroups ?? generatedTahapGroups;

  // Compute exact chart height to match the Excel-like S-curve table.
  // h-12 = 48px month/week header, h-6 = 24px group header, h-10 = 40px item row,
  // summary rows = 4 × 24px (planned, planned cumulative, actual, actual cumulative).
  const chartHeight = useMemo(() => {
    let contentHeight = 0;
    for (const group of tahapGroups) {
      if (group.header) contentHeight += 24;
      contentHeight += group.items.length * 40;
    }
    return 48 + contentHeight + 96;
  }, [tahapGroups]);

  const todayLabel  = format(new Date(), "dd MMM yy");
  const visibleChartData = useMemo(() => chartData.filter(point => !point.is_baseline), [chartData]);
  const scurveHeader = useMemo(() => buildMonthWeekHeader(chartData), [chartData]);
  const targetColor = "#3b82f6";
  const actualColor = "#22c55e";

  if (projects.length === 0) return null;

  const needsSelection = projects.length > 1 && (!selectedUnit || !selectedProjectId);
  const isProjectManagementPhase = selectedProject?.current_phase_code === "project_management";

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
            Task Timeline & S-Curve Overlay {scurveSource === "tasks" ? "• Calculated from task weights" : "• Phase fallback"}
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
      ) : !isProjectManagementPhase ? (
        <div className="flex flex-col items-center justify-center py-14 text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-white/10 rounded-xl bg-slate-50/50 dark:bg-black/10">
          <Activity size={28} className="mb-3 opacity-20" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">S-Curve appears in Project Management phase</p>
          <p className="text-xs mt-1">This project is currently in {selectedProject?.current_phase_code?.replace(/_/g, " ") || "another phase"}.</p>
        </div>
      ) : (
        <>
          {/* ── Keterangan (Y-axis) + S-Curve (side-by-side) ──────────── */}
          <div className="flex flex-row gap-0 border border-slate-200/60 dark:border-white/10 rounded-xl overflow-hidden">

            {/* LEFT: Keterangan — static view or task editor */}
            <div className="w-75 shrink-0 flex flex-col border-r border-slate-200/60 dark:border-white/10 bg-slate-50/30 dark:bg-black/20">

              {/* Header */}
              <div className="h-12 shrink-0 border-b border-slate-200/60 dark:border-white/10 flex items-center bg-slate-100/60 dark:bg-zinc-900/60 px-3 gap-2">
                <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Description</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-12 text-center">Weight</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 w-10 text-center">Real</span>
                {!editingTasks && dbTasks.length > 0 && (
                  <button onClick={startEdit} className="p-1 rounded-lg hover:bg-white dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="Edit tasks">
                    <Pencil size={11} />
                  </button>
                )}
              </div>

              {editingTasks ? (
                /* ── Editor mode ── */
                <div className="flex-1 flex flex-col overflow-y-auto">
                  {/* Total bobot indicator */}
                  {(() => {
                    const total = drafts.reduce((s, d) => s + (Number(d.weight_pct) || 0), 0);
                    const over  = total > 100;
                    return (
                      <div className={`px-3 py-1.5 text-[10px] font-semibold flex items-center justify-between border-b ${over ? "bg-rose-50 dark:bg-rose-500/10 text-rose-600 border-rose-200/60" : "bg-slate-50 dark:bg-white/3 text-slate-500 border-slate-200/50 dark:border-white/8"}`}>
                        <span>Total weight</span>
                        <span className={`font-bold ${over ? "text-rose-500" : total === 100 ? "text-emerald-500" : ""}`}>{total.toFixed(2)}%</span>
                      </div>
                    );
                  })()}

                  <div className="flex-1 divide-y divide-slate-100 dark:divide-white/5 overflow-y-auto">
                    {drafts.map((d, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 px-2 py-1.5">
                        <input
                          value={d.title}
                          onChange={e => setDraft(idx, "title", e.target.value)}
                          placeholder="Work item description..."
                          className="flex-1 min-w-0 text-[11px] bg-white dark:bg-zinc-800 border border-slate-200/70 dark:border-white/10 rounded-lg px-2 py-1 outline-none focus:border-brand-sienna/60 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                        />
                        <input
                          value={d.weight_pct}
                          onChange={e => setDraft(idx, "weight_pct", e.target.value)}
                          placeholder="0"
                          type="number" min="0" max="100" step="0.01"
                          className="w-14 text-[11px] bg-white dark:bg-zinc-800 border border-slate-200/70 dark:border-white/10 rounded-lg px-1.5 py-1 outline-none focus:border-brand-sienna/60 text-center font-mono text-slate-700 dark:text-slate-200"
                        />
                        <button onClick={() => removeDraft(idx)} className="p-1 rounded-lg text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors shrink-0">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add + Save/Cancel */}
                  <div className="border-t border-slate-200/60 dark:border-white/8 p-2 space-y-1.5">
                    <button onClick={addDraft} className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-dashed border-slate-200/70 dark:border-white/10 text-[11px] font-semibold text-slate-400 hover:text-brand-sienna hover:border-brand-sienna/40 transition-colors">
                      <Plus size={12} /> Add Item
                    </button>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingTasks(false)} className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
                        <X size={11} className="inline mr-1" />Cancel
                      </button>
                      <button
                        onClick={saveTasks}
                        disabled={saving}
                        className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white transition-colors disabled:opacity-50 glass-btn-primary"
                      >
                        {saving ? "Saving…" : <><Check size={11} className="inline mr-1" />Save</>}
                      </button>
                    </div>
                  </div>
                </div>
              ) : dbTasks.length === 0 ? (
                /* ── Empty state ── */
                <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4 text-center">
                  <Activity size={22} className="text-slate-300 dark:text-slate-600" />
                  <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">No work items yet</p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-600">Click Edit to add descriptions and weights.</p>
                  <button onClick={startEdit} className="mt-1 flex items-center justify-center w-8 h-8 rounded-lg font-bold glass-btn-primary text-white">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                </div>
              ) : (
                /* ── Static view ── */
                <>
                  <div className="flex-1 divide-y divide-slate-200/40 dark:divide-white/5 flex flex-col overflow-y-auto">
                    {dbTasks.map(t => (
                      <div key={t.id} className="flex text-[11px] hover:bg-slate-100/40 dark:hover:bg-white/4 transition-colors">
                        <div className="flex-1 flex items-center px-3 text-slate-700 dark:text-slate-200 leading-tight min-w-0">
                          <span className="line-clamp-2">{t.title}</span>
                        </div>
                        <div className="w-12 shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center font-mono text-[10px] text-slate-500 dark:text-slate-400">
                          {Number(t.weight_pct).toFixed(2)}
                        </div>
                        <div className="w-10 shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                          {Number(t.progress_pct).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary rows */}
                  <div className="shrink-0 border-t border-slate-200/60 dark:border-white/10 bg-slate-200/30 dark:bg-zinc-800/40 text-[9px] font-bold">
                    {[
                      ["Planned Weight", ""],
                      ["Cumulative Planned", ""],
                      ["Actual Weight", ""],
                      ["Cumulative Actual", ""],
                    ].map(([label, value]) => (
                      <div key={label} className="h-6 flex border-b last:border-b-0 border-slate-200/50 dark:border-white/8">
                      <div className="flex-1 px-3 flex items-center text-slate-700 dark:text-white/80 truncate">{label}</div>
                      <div className="w-16 shrink-0 border-l border-slate-200/60 dark:border-white/10 flex items-center justify-center text-cyan-600 dark:text-cyan-400">{value}</div>
                    </div>
                  ))}
                  </div>
                </>
              )}
            </div>

            {/* RIGHT: weekly S-curve grid + chart overlay */}
            <div className="flex-1 min-w-0 relative bg-white dark:bg-zinc-950/30 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700" style={{ minHeight: chartHeight }}>
              {scurveSource === "tasks" && chartData.length > 0 && (
                <div className="absolute inset-0 z-0 pointer-events-none" style={{ minWidth: `${Math.max(720, visibleChartData.length * 72)}px` }}>
                  <div className="h-12 border-b border-slate-200/60 dark:border-white/10">
                    <div className="h-6 grid border-b border-slate-200/50 dark:border-white/8" style={{ gridTemplateColumns: scurveHeader.monthGroups.map(g => `minmax(${g.colSpan * 72}px, ${g.colSpan}fr)`).join(" ") }}>
                      {scurveHeader.monthGroups.map((group, idx) => (
                        <div key={`${group.label}-${idx}`} className="flex items-center justify-center border-r border-slate-100/70 dark:border-white/5 text-[9px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-white/50">
                          {group.label}
                        </div>
                      ))}
                    </div>
                    <div className="h-6 grid" style={{ gridTemplateColumns: `repeat(${visibleChartData.length}, minmax(72px, 1fr))` }}>
                      {visibleChartData.map((point, idx) => (
                        <div key={point.month} className="flex items-center justify-center border-r border-slate-100/70 dark:border-white/5 text-[9px] font-bold text-slate-400 dark:text-white/35">
                          {scurveHeader.weekLabels[idx]}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="divide-y divide-slate-200/40 dark:divide-white/5">
                    {tahapGroups.map((group, gi) => (
                      <div key={gi}>
                        {group.header && <div className="h-6" style={{ backgroundColor: `${group.color}18` }} />}
                        {group.items.map((item, ii) => (
                          <div key={ii} className="h-10 grid" style={{ gridTemplateColumns: `repeat(${visibleChartData.length}, minmax(72px, 1fr))` }}>
                            {visibleChartData.map((point, pi) => {
                              const period = item.periods?.find(x => x.label === point.month || x.period_order === pi + 1);
                              return (
                                <div key={point.month} className="border-r border-slate-100/70 dark:border-white/5 flex items-center justify-center">
                                  {period && period.planned > 0 ? (
                                    <span
                                      className="rounded px-1 py-0.5 font-mono text-[10px] leading-none text-white shadow-sm"
                                      style={{ backgroundColor: group.color ?? "#64748b" }}
                                      title={`Planned weight: ${period.planned.toFixed(2)}${period.actual > 0 ? ` • Actual weight: ${period.actual.toFixed(2)}` : ""}`}
                                    >
                                      {period.planned.toFixed(2)}
                                    </span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-slate-200/60 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 font-mono text-[10px] leading-tight">
                    {[
                      { key: "planned_weekly", color: "text-slate-600 dark:text-white/70", value: (p: SCurvePoint) => p.planned_weekly ?? 0 },
                      { key: "target", color: "text-blue-500", value: (p: SCurvePoint) => p.target },
                      { key: "actual_weekly", color: "text-emerald-500", value: (p: SCurvePoint) => p.actual_weekly ?? 0 },
                      { key: "actual", color: "text-emerald-600 dark:text-emerald-400", value: (p: SCurvePoint) => p.actual ?? 0 },
                    ].map(row => (
                      <div key={row.key} className="h-6 grid border-b last:border-b-0 border-slate-200/50 dark:border-white/8" style={{ gridTemplateColumns: `repeat(${visibleChartData.length}, minmax(72px, 1fr))` }}>
                        {visibleChartData.map(point => (
                          <div key={`${row.key}-${point.month}`} className={`border-r border-slate-100/70 dark:border-white/5 flex items-center justify-center ${row.color}`}>
                            {row.value(point).toFixed(2)}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="relative z-10 h-full" style={{ minWidth: scurveSource === "tasks" ? `${Math.max(720, visibleChartData.length * 72)}px` : undefined }}>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <ComposedChart
                  data={chartData}
                  margin={{
                    top: 48,
                    right: 2,
                    bottom: scurveSource === "tasks" ? 96 : 36,
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
                    hide
                  />
                  <YAxis
                    yAxisId="pct"
                    domain={[0, 100]}
                    width={0}
                    hide
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {chartData.some(p => p.month === todayLabel) && (
                    <ReferenceLine
                      yAxisId="pct"
                      x={todayLabel}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: "Today", position: "top", fill: "#f59e0b", fontSize: 9 }}
                    />
                  )}
                  <Area yAxisId="pct" type="monotone" dataKey="target" fill="url(#scTargetGrad)" stroke="none" />
                  <Area yAxisId="pct" type="monotone" dataKey="actual" fill="url(#scActualGrad)" stroke="none" />
                  <Line yAxisId="pct" type="monotone" dataKey="target" stroke={targetColor} strokeWidth={2.5} dot={false} strokeDasharray="6 3" name="Planned" />
                  <Line yAxisId="pct" type="monotone" dataKey="actual" stroke={actualColor} strokeWidth={3.5} dot={false} connectNulls name="Actual" />
                </ComposedChart>
              </ResponsiveContainer>
              </div>
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
                        <span className="text-white/40">Weight</span>
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
