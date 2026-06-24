"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Area,
} from "recharts";
import { format, addDays, parseISO, isValid } from "date-fns";
import { Plus, Trash2, ChevronDown, ChevronRight, Activity, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";
import AnimatedDropdown from "./AnimatedDropdown";

// ─── Types ─────────────────────────────────────────────────────────────────────

type STask = {
  id: string;
  name: string;
  unit: string;
  vol: string;
  bobot: number;
  weeklyPlan: Record<string, number>;
  weeklyActual: Record<string, number>;
};

type SStep = {
  id: string;
  letter: string;
  name: string;
  step_order: number;
  tasks: STask[];
};

type DBProject = {
  id: string;
  project_name: string;
  unit_code?: string | null;
  unit_name?: string | null;
  pm_start?: string | null;
  pm_end?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  current_phase_code?: string | null;
  [key: string]: unknown;
};

type ChartPoint = { label: string; plan: number; actual: number | null };
type MonthGroup = { label: string; count: number };

// ─── Helpers ────────────────────────────────────────────────────────────────────

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

function generateWeeks(start: Date, end: Date): string[] {
  const weeks: string[] = [];
  let cur = new Date(start);
  while (cur.getDay() !== 1) cur = addDays(cur, 1);
  while (cur <= end) {
    weeks.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 7);
  }
  // Include pm_end itself if it falls after the last Monday (partial final week)
  const endStr = format(end, "yyyy-MM-dd");
  if (weeks.length > 0 && weeks[weeks.length - 1] !== endStr) {
    weeks.push(endStr);
  }
  return weeks;
}

function buildMonthGroups(weeks: string[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const w of weeks) {
    const label = format(parseISO(w), "MMM yyyy");
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.count++;
    else groups.push({ label, count: 1 });
  }
  return groups;
}

// Convert API response rows to SStep[]
function parseApiSteps(data: {
  id: string; letter: string; name: string; step_order: number;
  tasks: { id: string; name: string; unit: string; vol: string; bobot: number; task_order: number; weeks: { week_date: string; plan_pct: number; actual_pct: number }[] }[]
}[]): SStep[] {
  return data.map(s => ({
    id: s.id,
    letter: s.letter,
    name: s.name,
    step_order: s.step_order,
    tasks: s.tasks.map(t => ({
      id: t.id,
      name: t.name,
      unit: t.unit,
      vol: t.vol,
      bobot: t.bobot,
      weeklyPlan: Object.fromEntries(t.weeks.map(w => [w.week_date, w.plan_pct])),
      weeklyActual: Object.fromEntries(t.weeks.map(w => [w.week_date, w.actual_pct !== 0 ? w.actual_pct : w.plan_pct])),
    })),
  }));
}

// Auto-distribute each task's bobot linearly across all weeks
function calcWeeklyPlan(steps: SStep[], weeks: string[]): Record<string, number> {
  const n = weeks.length;
  if (!n) return {};
  const result: Record<string, number> = {};
  for (const w of weeks) result[w] = 0;
  for (const step of steps) {
    for (const task of step.tasks) {
      const perWeek = task.bobot / n;
      for (const w of weeks) result[w] += perWeek;
    }
  }
  return result;
}

function buildChartData(steps: SStep[], weeks: string[], pmStart?: Date): ChartPoint[] {
  if (!weeks.length) return [];
  const weeklyPlan = calcWeeklyPlan(steps, weeks);
  const weekTotals = weeks.map(w =>
    steps.reduce((sum, s) => sum + s.tasks.reduce((ts, t) => ts + (t.weeklyActual[w] ?? 0), 0), 0)
  );
  const lastActualIdx = weekTotals.reduceRight((found, v, i) => found === -1 && v > 0 ? i : found, -1);
  const hasAnyActual = lastActualIdx >= 0;
  let cumPlan = 0, cumActual = 0;
  // Use actual pm_start as origin label so chart starts from the real project date
  const originDate = pmStart ?? addDays(parseISO(weeks[0]), -7);
  const originLabel = format(originDate, "d MMM");
  const points: ChartPoint[] = [{ label: originLabel, plan: 0, actual: hasAnyActual ? 0 : null }];
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    cumPlan = Math.min(100, cumPlan + (weeklyPlan[w] ?? 0));
    cumActual = Math.min(100, cumActual + weekTotals[i]);
    points.push({
      label: format(parseISO(w), "d MMM"),
      plan: Number(cumPlan.toFixed(2)),
      // Stop actual line after the last week with data
      actual: hasAnyActual && i <= lastActualIdx ? Number(cumActual.toFixed(2)) : null,
    });
  }
  return points;
}

// ─── Tooltip ───────────────────────────────────────────────────────────────────

interface TPayload { dataKey: string; value: number | null; color: string; name: string }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2 shadow-xl bg-white/95 dark:bg-zinc-950/96 backdrop-blur-xl">
      <p className="text-[10px] font-bold text-slate-500 dark:text-white/50 mb-1">{label}</p>
      {payload.filter(p => p.value !== null).map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500 dark:text-white/60">{p.name}:</span>
          <span className="font-bold text-slate-900 dark:text-white">{(p.value ?? 0).toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Fake S-Curve backdrop ─────────────────────────────────────────────────────

function FakeSCurve() {
  return (
    <div className="absolute inset-0 p-8">
      <svg viewBox="0 0 500 180" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="fpSC" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="faSC" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,175 C80,165 130,130 190,90 C250,48 330,12 500,4 L500,180 L0,180 Z" fill="url(#fpSC)" />
        <path d="M0,175 C80,170 140,155 200,135 C260,105 310,60 390,38 L390,180 L0,180 Z" fill="url(#faSC)" />
        <path d="M0,175 C80,165 130,130 190,90 C250,48 330,12 500,4" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" opacity="0.8" />
        <path d="M0,175 C80,170 140,155 200,135 C260,105 310,60 390,38" fill="none" stroke="#22c55e" strokeWidth="2.5" opacity="0.8" />
      </svg>
    </div>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CELL_W = 64;
const LEFT_W = 300;

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SCurveCharts({ projects }: { projects: DBProject[] }) {

  // ── Project selection ─────────────────────────────────────────────────────────
  const isSingle = projects.length === 1;
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");

  const unitOptions = useMemo(() => {
    const units = Array.from(new Set(projects.map(p => p.unit_code).filter(Boolean) as string[])).sort();
    return [{ value: "", label: "Select Unit" }, ...units.map(u => ({ value: u, label: u }))];
  }, [projects]);

  const projectOptions = useMemo(() => {
    if (!selectedUnit) return [{ value: "", label: "Select Project" }];
    return [
      { value: "", label: "Select Project" },
      ...projects
        .filter(p => p.unit_code === selectedUnit)
        .map(p => {
          const parts = p.project_name.split(" - ");
          return { value: p.id, label: parts.length > 1 ? parts.slice(1).join(" - ") : p.project_name };
        }),
    ];
  }, [projects, selectedUnit]);

  const selectedProject = useMemo(() => {
    if (isSingle) return projects[0];
    return projects.find(p => p.id === selectedProjectId) ?? null;
  }, [isSingle, projects, selectedProjectId]);

  const projectId = selectedProject?.id ?? null;

  // ── Weeks ─────────────────────────────────────────────────────────────────────
  const weeks = useMemo(() => {
    if (!selectedProject) return [];
    const start = parseDate(selectedProject.pm_start) ?? parseDate(selectedProject.start_date);
    const end   = parseDate(selectedProject.pm_end)   ?? parseDate(selectedProject.end_date);
    if (!start || !end || start > end) return [];
    return generateWeeks(start, end);
  }, [selectedProject]);

  const monthGroups = useMemo(() => buildMonthGroups(weeks), [weeks]);

  // ── Steps state (from DB) ─────────────────────────────────────────────────────
  const [steps, setSteps]     = useState<SStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const fetchSteps = useCallback(async (pid: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${pid}/scurve-steps`, { cache: "no-store" });
      const j = await res.json();
      if (j.success) setSteps(parseApiSteps(j.data));
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!projectId) { setSteps([]); return; }
    fetchSteps(projectId);
  }, [projectId, fetchSteps]);

  // ── Cell editing (actual values only) ────────────────────────────────────────
  const [editingCell, setEditingCell] = useState<{ taskId: string; week: string } | null>(null);
  const [cellInput, setCellInput] = useState("");
  const [saving, setSaving] = useState(false);

  function startCellEdit(taskId: string, week: string, current: number) {
    setEditingCell({ taskId, week });
    setCellInput(current ? String(current) : "");
  }

  async function commitCell() {
    if (!editingCell || !projectId) { setEditingCell(null); return; }
    const val = Math.max(0, parseFloat(cellInput) || 0);

    // Optimistic update
    setSteps(prev => prev.map(step => ({
      ...step,
      tasks: step.tasks.map(task => {
        if (task.id !== editingCell.taskId) return task;
        return { ...task, weeklyActual: { ...task.weeklyActual, [editingCell.week]: val } };
      }),
    })));
    setEditingCell(null);

    // Persist
    setSaving(true);
    const snap = editingCell;
    try {
      const res = await fetch(`/api/projects/${projectId}/scurve-weeks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: snap.taskId, weekDate: snap.week, mode: "actual", actualPct: val }),
      });
      const j = await res.json();
      if (!j.success) {
        console.error("Save failed:", j.error);
        alert(`Gagal menyimpan: ${j.error}`);
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Gagal menyimpan nilai. Cek koneksi.");
    } finally {
      setSaving(false);
    }
  }

  // ── Setup wizard (bulk add steps when none exist) ────────────────────────────
  const [setupRows, setSetupRows] = useState<string[]>(["", "", ""]);
  const [setupSaving, setSetupSaving] = useState(false);

  async function createSetupSteps() {
    const names = setupRows.filter(n => n.trim());
    if (!names.length || !projectId) return;
    setSetupSaving(true);
    try {
      const created: SStep[] = [];
      for (const name of names) {
        const res = await fetch(`/api/projects/${projectId}/scurve-steps`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const j = await res.json();
        if (j.success) created.push({ ...j.data, tasks: [] });
      }
      setSteps(created);
    } finally {
      setSetupSaving(false);
    }
  }

  // ── Add Step modal ────────────────────────────────────────────────────────────
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [stepName, setStepName] = useState("");
  const [addingStep, setAddingStep] = useState(false);

  async function addStep() {
    if (!stepName.trim() || !projectId) return;
    setAddingStep(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scurve-steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stepName.trim() }),
      });
      const j = await res.json();
      if (j.success) {
        setSteps(prev => [...prev, { ...j.data, tasks: [] }]);
        setStepName("");
        setAddStepOpen(false);
      }
    } finally {
      setAddingStep(false);
    }
  }

  async function deleteStep(stepId: string) {
    if (!projectId) return;
    // Optimistic
    setSteps(prev => prev.filter(s => s.id !== stepId));
    await fetch(`/api/projects/${projectId}/scurve-steps/${stepId}`, { method: "DELETE" });
  }

  // ── Add Task modal ────────────────────────────────────────────────────────────
  const [addTaskStep, setAddTaskStep] = useState<string | null>(null);
  const [taskForm, setTaskForm] = useState({ name: "", unit: "", vol: "", weight: "" });
  const [addingTask, setAddingTask] = useState(false);

  async function addTask() {
    if (!addTaskStep || !taskForm.name.trim() || !projectId) return;
    setAddingTask(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scurve-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stepId: addTaskStep,
          name: taskForm.name.trim(),
          unit: taskForm.unit.trim(),
          vol: taskForm.vol.trim(),
          bobot: parseFloat(taskForm.weight) || 0,
        }),
      });
      const j = await res.json();
      if (j.success) {
        setSteps(prev => prev.map(s => s.id === addTaskStep
          ? { ...s, tasks: [...s.tasks, { ...j.data, weeklyPlan: {}, weeklyActual: {} }] }
          : s
        ));
        setTaskForm({ name: "", unit: "", vol: "", weight: "" });
        setAddTaskStep(null);
      }
    } finally {
      setAddingTask(false);
    }
  }

  async function deleteTask(stepId: string, taskId: string) {
    if (!projectId) return;
    // Optimistic
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, tasks: s.tasks.filter(t => t.id !== taskId) } : s));
    await fetch(`/api/projects/${projectId}/scurve-tasks/${taskId}`, { method: "DELETE" });
  }

  // ── Summary (plan = auto from bobot, actual = manual) ────────────────────────
  const weeklyAutoPlan = useMemo(() => calcWeeklyPlan(steps, weeks), [steps, weeks]);

  const cumSummary = useMemo(() => {
    const lastActualIdx = [...weeks].map(w =>
      steps.reduce((sum, s) => sum + s.tasks.reduce((ts, t) => ts + (t.weeklyActual[w] ?? 0), 0), 0)
    ).reduceRight((found, v, i) => found === -1 && v > 0 ? i : found, -1);

    let cumR = 0, cumA = 0;
    return weeks.map((w, i) => {
      const rencana = weeklyAutoPlan[w] ?? 0;
      let realisasi = 0;
      for (const step of steps) {
        for (const task of step.tasks) {
          realisasi += task.weeklyActual[w] ?? 0;
        }
      }
      cumR += rencana;
      const pastLast = lastActualIdx >= 0 && i > lastActualIdx;
      if (!pastLast) cumA += realisasi;
      return {
        week: w, rencana,
        realisasi: pastLast ? null : realisasi,
        cumRencana: cumR,
        cumRealisasi: pastLast ? null : cumA,
        deviasi: pastLast ? null : (cumA - cumR),
      };
    });
  }, [steps, weeks, weeklyAutoPlan]);

  // ── Chart ─────────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const pmStart = parseDate(selectedProject?.pm_start) ?? parseDate(selectedProject?.start_date) ?? undefined;
    return buildChartData(steps, weeks, pmStart);
  }, [steps, weeks, selectedProject]);
  const hasChart  = chartData.some(p => p.plan > 0);

  // ── Render ────────────────────────────────────────────────────────────────────
  const projectTitle = selectedProject ? (() => {
    const parts = selectedProject.project_name.split(" - ");
    return parts.length > 1 ? parts.slice(1).join(" - ") : selectedProject.project_name;
  })() : "";

  const totalBobot = steps.reduce((s, step) => s + step.tasks.reduce((ts, t) => ts + t.bobot, 0), 0);

  return (
    <div className="glass-card overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-white/8 flex items-center gap-3 flex-wrap bg-white/60 dark:bg-zinc-900/60">
        <Activity size={14} className="text-blue-500 shrink-0" />
        {isSingle ? (
          <span className="text-[12px] font-bold text-slate-800 dark:text-white truncate max-w-xs">
            {projectTitle || selectedProject?.project_name}
          </span>
        ) : (
          <>
            <AnimatedDropdown value={selectedUnit} options={unitOptions} onChange={v => { setSelectedUnit(v); setSelectedProjectId(""); }} minWidth={120} />
            {selectedUnit && <AnimatedDropdown value={selectedProjectId} options={projectOptions} onChange={setSelectedProjectId} minWidth={200} />}
          </>
        )}

        {selectedProject && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {saving && <Loader2 size={12} className="animate-spin text-slate-400" />}
            {/* Total bobot pill */}
            {totalBobot > 0 && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${Math.abs(totalBobot - 100) < 0.05 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"}`}>
                Weight {totalBobot.toFixed(2)}%
              </span>
            )}
            {/* Add Step */}
            <button
              onClick={() => { setStepName(""); setAddStepOpen(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              <Plus size={12} /> Add Step
            </button>
          </div>
        )}
      </div>

      {/* ── No project selected ─────────────────────────────────────────────────── */}
      {!selectedProject && !isSingle && (
        <div className="p-12 text-center text-sm text-slate-400 dark:text-slate-500">Select a unit and project to begin</div>
      )}

      {/* ── Grid + Chart ────────────────────────────────────────────────────────── */}
      {selectedProject && (
        <>
          {loading ? (
            <div className="flex items-center justify-center p-12 gap-2 text-slate-400 text-sm">
              <Loader2 size={16} className="animate-spin" /> Loading...
            </div>
          ) : weeks.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400 dark:text-slate-500">
              No timeline found. Set PM Start / End dates in Project Details.
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700">
              <div style={{ minWidth: LEFT_W + weeks.length * CELL_W }}>

                {/* Month header */}
                <div className="flex border-b border-slate-200/60 dark:border-white/8 bg-slate-100/80 dark:bg-zinc-800/60">
                  <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 h-7 flex items-center px-3 gap-2" style={{ width: LEFT_W }}>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 w-8 shrink-0 text-center">NO</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 flex-1">ITEM / DESCRIPTION</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 w-14 text-right shrink-0">WEIGHT%</span>
                  </div>
                  {monthGroups.map((mg, i) => (
                    <div key={i} style={{ width: mg.count * CELL_W }} className="h-7 flex items-center justify-center border-r border-slate-200/60 dark:border-white/8">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 truncate px-1">{mg.label}</span>
                    </div>
                  ))}
                </div>

                {/* Week number row — resets per month */}
                <div className="flex border-b border-slate-200/60 dark:border-white/8 bg-slate-50/60 dark:bg-zinc-900/40">
                  <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 h-6" style={{ width: LEFT_W }} />
                  {(() => {
                    const monthCounts = new Map<string, number>();
                    return weeks.map((w, i) => {
                      const month = format(parseISO(w), "MMM yyyy");
                      const n = (monthCounts.get(month) ?? 0) + 1;
                      monthCounts.set(month, n);
                      return (
                        <div key={i} style={{ width: CELL_W, minWidth: CELL_W }} className="h-6 flex items-center justify-center border-r border-slate-200/40 dark:border-white/5">
                          <span className="text-[8px] font-bold text-slate-400 dark:text-slate-500">{n}</span>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Setup wizard — shown when no steps exist */}
                {steps.length === 0 && (
                  <div className="flex items-center justify-center py-10 px-6">
                    <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/60 dark:border-white/10 shadow-lg p-6">
                      <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Setup S-Curve Steps</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">Add all steps at once — you can edit later</p>
                      <div className="space-y-2 mb-4">
                        {setupRows.map((name, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-amber-500 w-5 shrink-0">{LETTERS[i] ?? "?"}</span>
                            <input
                              value={name}
                              onChange={e => setSetupRows(prev => prev.map((r, ri) => ri === i ? e.target.value : r))}
                              onKeyDown={e => { if (e.key === "Enter" && i === setupRows.length - 1) setSetupRows(p => [...p, ""]); }}
                              placeholder={`Step ${LETTERS[i] ?? i + 1}...`}
                              className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-[12px] text-slate-800 dark:text-white outline-none focus:border-amber-400 dark:focus:border-amber-500"
                            />
                            {setupRows.length > 1 && (
                              <button onClick={() => setSetupRows(p => p.filter((_, ri) => ri !== i))} className="text-slate-300 hover:text-rose-400 transition-colors shrink-0">
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <button onClick={() => setSetupRows(p => [...p, ""])} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors mb-4">
                        <Plus size={12} /> Add Row
                      </button>
                      <button
                        onClick={createSetupSteps}
                        disabled={!setupRows.some(n => n.trim()) || setupSaving}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-amber-500 text-white text-[12px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-colors"
                      >
                        {setupSaving ? <Loader2 size={13} className="animate-spin" /> : null}
                        Start S-Curve →
                      </button>
                    </div>
                  </div>
                )}

                {/* Steps + Tasks */}
                {steps.map((step, si) => {
                  const stepBobot = step.tasks.reduce((s, t) => s + t.bobot, 0);
                  const isCollapsed = collapsed.has(step.id);
                  return (
                    <div key={step.id}>
                      {/* Step header */}
                      <div className="flex border-b border-slate-200/60 dark:border-white/8 bg-slate-100/50 dark:bg-zinc-800/25 group/step">
                        <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 flex items-center gap-2 px-2 h-9" style={{ width: LEFT_W }}>
                          <button
                            onClick={() => setCollapsed(c => { const n = new Set(c); n.has(step.id) ? n.delete(step.id) : n.add(step.id); return n; })}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors shrink-0"
                          >
                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 w-5 shrink-0">{step.letter}</span>
                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-100 flex-1 truncate uppercase tracking-wide">{step.name}</span>
                          {stepBobot > 0 && <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 shrink-0 w-12 text-right">{stepBobot.toFixed(2)}</span>}
                          <button
                            onClick={() => { setTaskForm({ name: "", unit: "", vol: "", weight: "" }); setAddTaskStep(step.id); }}
                            className="flex items-center gap-0.5 text-[9px] font-bold text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0 px-1"
                          >
                            <Plus size={9} /> Task
                          </button>
                          <button onClick={() => deleteStep(step.id)} className="opacity-0 group-hover/step:opacity-100 text-slate-300 hover:text-rose-500 dark:text-white/20 dark:hover:text-rose-400 transition-all shrink-0">
                            <Trash2 size={10} />
                          </button>
                        </div>
                        {weeks.map((_, wi) => (
                          <div key={wi} style={{ width: CELL_W, minWidth: CELL_W }} className="h-9 border-r border-slate-200/30 dark:border-white/4" />
                        ))}
                      </div>

                      {/* Task rows */}
                      {!isCollapsed && step.tasks.map((task, ti) => {
                        return (
                          <div key={task.id} className="flex border-b border-slate-200/40 dark:border-white/5 hover:bg-slate-50/40 dark:hover:bg-white/1.5 group/task">
                            <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 flex items-center gap-2 px-2 h-10" style={{ width: LEFT_W }}>
                              <span className="text-[9px] text-slate-400 w-8 shrink-0 text-center">{si + 1}.{ti + 1}</span>
                              <span className="text-[11px] text-slate-700 dark:text-slate-200 flex-1 truncate">{task.name}</span>
                              <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 w-14 text-right shrink-0">{task.bobot.toFixed(2)}</span>
                              <button onClick={() => deleteTask(step.id, task.id)} className="opacity-0 group-hover/task:opacity-100 text-slate-300 hover:text-rose-500 dark:text-white/20 dark:hover:text-rose-400 transition-all shrink-0 ml-0.5">
                                <Trash2 size={9} />
                              </button>
                            </div>
                            {weeks.map((w, wi) => {
                              const v = task.weeklyActual[w] ?? 0;
                              const isEditing = editingCell?.taskId === task.id && editingCell.week === w;
                              return (
                                <div
                                  key={wi}
                                  style={{ width: CELL_W, minWidth: CELL_W }}
                                  className={`h-10 border-r border-slate-200/30 dark:border-white/4 flex items-center justify-center ${v > 0 ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}
                                >
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      value={cellInput}
                                      onChange={e => setCellInput(e.target.value)}
                                      onBlur={commitCell}
                                      onKeyDown={e => { if (e.key === "Enter") commitCell(); if (e.key === "Escape") setEditingCell(null); }}
                                      className="w-full h-full text-center text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 outline-none border-0 text-amber-700 dark:text-amber-300"
                                      placeholder="0.00"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => startCellEdit(task.id, w, v)}
                                      className="w-full h-full flex items-center justify-center text-[10px] font-semibold hover:bg-emerald-100/80 dark:hover:bg-emerald-900/30 hover:ring-1 hover:ring-inset hover:ring-emerald-300 dark:hover:ring-emerald-700 transition-all cursor-pointer"
                                    >
                                      {v > 0
                                        ? <span className="text-emerald-600 dark:text-emerald-400 font-bold">{v.toFixed(2)}</span>
                                        : <span className="text-slate-300 dark:text-slate-600 text-[9px] group-hover/task:text-emerald-400 dark:group-hover/task:text-emerald-600 transition-colors">+</span>
                                      }
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Summary rows */}
                {steps.length > 0 && (
                  <>
                    {([
                      { label: "PLANNED",      key: "rencana" as const,      textCls: "text-blue-600 dark:text-blue-400",      bg: "bg-blue-50/40 dark:bg-blue-950/15" },
                      { label: "ACTUAL",       key: "realisasi" as const,    textCls: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50/40 dark:bg-emerald-950/15" },
                      { label: "CUM. PLANNED", key: "cumRencana" as const,   textCls: "text-blue-700 dark:text-blue-300",      bg: "bg-blue-50/60 dark:bg-blue-950/25" },
                      { label: "CUM. ACTUAL",  key: "cumRealisasi" as const, textCls: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50/60 dark:bg-emerald-950/25" },
                      { label: "DEVIATION",    key: "deviasi" as const,      textCls: "",                                      bg: "bg-slate-50/60 dark:bg-zinc-800/30" },
                    ] as const).map(row => (
                      <div key={row.key} className={`flex border-t border-slate-200/60 dark:border-white/8 ${row.bg}`}>
                        <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 flex items-center px-3 h-7" style={{ width: LEFT_W }}>
                          <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{row.label}</span>
                        </div>
                        {cumSummary.map((s, wi) => {
                          const v = s[row.key];
                          const cls = row.key === "deviasi"
                            ? ((v ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
                            : row.textCls;
                          return (
                            <div key={wi} style={{ width: CELL_W, minWidth: CELL_W }} className="h-7 border-r border-slate-200/30 dark:border-white/4 flex items-center justify-center">
                              {v !== null && v !== 0 && <span className={`text-[9px] font-bold ${cls}`}>{v.toFixed(2)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── S-Curve Chart ─────────────────────────────────────────────────── */}
          {!loading && weeks.length > 0 && (
            <div className="border-t border-slate-200/60 dark:border-white/8 relative" style={{ height: 240 }}>
              {!hasChart ? (
                <>
                  <div className="absolute inset-0 pointer-events-none opacity-35" style={{ filter: "blur(3px)" }}>
                    <FakeSCurve />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 bg-white/80 dark:bg-zinc-900/80 px-4 py-2 rounded-lg backdrop-blur-sm">
                      Enter plan values in the grid to generate the S-Curve
                    </p>
                  </div>
                </>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 12, right: 20, bottom: 28, left: 8 }}>
                    <defs>
                      <linearGradient id="planGradSC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="actualGradSC" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.15" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                    <XAxis dataKey="label" tick={{ fontSize: 8, fill: "currentColor" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: "currentColor" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={34} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="plan" name="Planned Target" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" fill="url(#planGradSC)" dot={false} connectNulls />
                    <Line type="monotone" dataKey="actual" name="Actual Progress" stroke="#22c55e" strokeWidth={2.5} dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <div className="absolute bottom-1 left-4 flex items-center gap-4 pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5 3" /></svg>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500">Planned Target</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#22c55e" strokeWidth="2.5" /></svg>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">Actual Progress</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Add Step Modal ─────────────────────────────────────────────────────── */}
      {addStepOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-9999 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAddStepOpen(false)} />
          <div className="relative z-10 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-slate-200/60 dark:border-white/10 p-6 w-full max-w-sm mx-4">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-4">Add Step</h3>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-[13px] font-bold text-amber-600 shrink-0">
                {LETTERS[Math.min(steps.length, 25)]}
              </div>
              <input
                autoFocus
                value={stepName}
                onChange={e => setStepName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addStep(); if (e.key === "Escape") setAddStepOpen(false); }}
                placeholder="e.g. PRELIMINARY, PEKERJAAN DINDING..."
                className="flex-1 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-[12px] text-slate-800 dark:text-white outline-none focus:border-amber-400 dark:focus:border-amber-500"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddStepOpen(false)} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={addStep} disabled={!stepName.trim() || addingStep} className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white text-[12px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {addingStep && <Loader2 size={12} className="animate-spin" />}
                Add Step
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Add Task Modal ─────────────────────────────────────────────────────── */}
      {addTaskStep && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-9999 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAddTaskStep(null)} />
          <div className="relative z-10 bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-slate-200/60 dark:border-white/10 p-6 w-full max-w-md mx-4">
            <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-1">Add Task</h3>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-4">
              Step: <span className="font-semibold text-amber-600">{steps.find(s => s.id === addTaskStep)?.letter} — {steps.find(s => s.id === addTaskStep)?.name}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Description</label>
                <input
                  autoFocus
                  value={taskForm.name}
                  onChange={e => setTaskForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Escape") setAddTaskStep(null); }}
                  placeholder="Work item description..."
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-[12px] text-slate-800 dark:text-white outline-none focus:border-amber-400 dark:focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">Weight %</label>
                <input
                  value={taskForm.weight}
                  onChange={e => setTaskForm(f => ({ ...f, weight: e.target.value }))}
                  placeholder="0.00"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="w-full rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-[12px] text-slate-800 dark:text-white outline-none focus:border-amber-400 dark:focus:border-amber-500"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setAddTaskStep(null)} className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-white/10 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={addTask} disabled={!taskForm.name.trim() || addingTask} className="flex-1 px-4 py-2 rounded-lg bg-amber-500 text-white text-[12px] font-bold hover:bg-amber-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {addingTask && <Loader2 size={12} className="animate-spin" />}
                Add Task
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
