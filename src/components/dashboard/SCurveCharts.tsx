"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid,
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

type ChartPoint = {
  label: string; plan: number; actual: number | null;
  // Actual is split into two series so the line can change color at the point
  // it crosses Planned — green while on/ahead of target, red while behind.
  actualAhead: number | null; actualBehind: number | null;
};
type MonthGroup = { label: string; count: number };

// ─── Helpers ────────────────────────────────────────────────────────────────────

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

// Full calendar weeks (Mon–Sun) covering the schedule, matching the Excel time
// schedule: each week runs from its Monday (start) through Sunday (end). The
// week is keyed by its Monday, same as the imported period start dates.
function generateWeeks(start: Date, end: Date): string[] {
  const weeks: string[] = [];
  // Snap back to the Monday of the week that contains the start date, so the
  // first (possibly partial) week is included in full — "from start of week".
  let cur = new Date(start);
  while (cur.getDay() !== 1) cur = addDays(cur, -1);
  // Include every week whose Monday falls on/before the end date, so the final
  // week is shown in full — "to end of week".
  while (cur <= end) {
    weeks.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 7);
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
      weeklyActual: Object.fromEntries(t.weeks.map(w => [w.week_date, w.actual_pct])),
    })),
  }));
}

// Use per-week plan data from DB if available; fall back to uniform distribution
function calcWeeklyPlan(steps: SStep[], weeks: string[]): Record<string, number> {
  const n = weeks.length;
  if (!n) return {};
  const result: Record<string, number> = {};
  for (const w of weeks) result[w] = 0;
  for (const step of steps) {
    for (const task of step.tasks) {
      const hasPerWeekPlan = Object.keys(task.weeklyPlan).length > 0;
      if (hasPerWeekPlan) {
        for (const w of weeks) result[w] += task.weeklyPlan[w] ?? 0;
      } else {
        const perWeek = task.bobot / n;
        for (const w of weeks) result[w] += perWeek;
      }
    }
  }
  return result;
}

// Cumulative-actual series (realisasi kumulatif) per week.
// The PM enters the cumulative % directly for reported weeks; weeks in between
// carry forward the last known value, and weeks after the last report are null
// (not yet reported). Mirrors the Excel "KUMULATIF REALISASI" row.
function cumActualSeries(weeks: string[], cumActuals: Record<string, number>): (number | null)[] {
  let lastIdx = -1;
  for (let i = 0; i < weeks.length; i++) if (cumActuals[weeks[i]] != null) lastIdx = i;
  const out: (number | null)[] = [];
  let last = 0;
  for (let i = 0; i < weeks.length; i++) {
    const v = cumActuals[weeks[i]];
    if (v != null) last = v;
    out.push(i <= lastIdx ? last : null);
  }
  return out;
}

function buildChartData(steps: SStep[], weeks: string[], cumActuals: Record<string, number>, pmStart?: Date, pmEnd?: Date): ChartPoint[] {
  if (!weeks.length) return [];
  const weeklyPlan = calcWeeklyPlan(steps, weeks);
  const actualCum = cumActualSeries(weeks, cumActuals);
  const hasAnyActual = actualCum.some(v => v != null);
  let cumPlan = 0;
  // Origin = project start at 0%. Each week point is labelled by its END date
  // (Sunday, capped to pm_end) — the cumulative value reached by that date.
  const points: ChartPoint[] = [{ label: pmStart ? format(pmStart, "d MMM") : "", plan: 0, actual: hasAnyActual ? 0 : null, actualAhead: null, actualBehind: null }];
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    cumPlan = cumPlan + (weeklyPlan[w] ?? 0);
    const a = actualCum[i];
    const weekEnd = addDays(parseISO(w), 6);
    const labelDate = pmEnd && pmEnd < weekEnd ? pmEnd : weekEnd;
    points.push({
      label: format(labelDate, "d MMM"),
      plan: Number(cumPlan.toFixed(2)),
      actual: a == null ? null : Number(a.toFixed(2)),
      actualAhead: null, actualBehind: null,
    });
  }

  // Split actual into "ahead/on-track" (>= plan) vs "behind" (< plan) series,
  // duplicating the point at each crossing into both series so the colored
  // segments touch instead of leaving a gap.
  const status = points.map(p => p.actual == null ? null : (p.actual >= p.plan ? "ahead" : "behind"));
  for (let i = 0; i < points.length; i++) {
    const s = status[i];
    if (s === null) continue;
    if (s === "ahead") points[i].actualAhead = points[i].actual;
    else points[i].actualBehind = points[i].actual;
    const prev = status[i - 1];
    if (prev != null && prev !== s) {
      if (s === "ahead") points[i - 1].actualAhead = points[i - 1].actual;
      else points[i - 1].actualBehind = points[i - 1].actual;
    }
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

const CELL_W = 48;
const LEFT_W = 500;

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
  const hasPmDates = !!(parseDate(selectedProject?.pm_start) && parseDate(selectedProject?.pm_end));
  const pmStartDate = useMemo(() => parseDate(selectedProject?.pm_start), [selectedProject]);
  const pmEndDate   = useMemo(() => parseDate(selectedProject?.pm_end),   [selectedProject]);

  const weeks = useMemo(() => {
    if (!selectedProject) return [];
    // Strictly require PM phase dates — no fallback to start_date/end_date
    const start = parseDate(selectedProject.pm_start);
    const end   = parseDate(selectedProject.pm_end);
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

  // ── Cumulative actual (realisasi kumulatif) — entered per week by the PM ──────
  const [cumActuals, setCumActuals] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!projectId) { setCumActuals({}); return; }
    fetch(`/api/projects/${projectId}/scurve-week-actuals`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setCumActuals(Object.fromEntries(
            (j.data as { week_date: string; cum_actual_pct: number }[]).map(r => [r.week_date, r.cum_actual_pct])
          ));
        }
      })
      .catch(() => {});
  }, [projectId]);

  // ── Cell editing (plan values in the grid) ───────────────────────────────────
  const [editingCell, setEditingCell] = useState<{ taskId: string; week: string } | null>(null);
  const [cellInput, setCellInput] = useState("");
  const [cellOriginal, setCellOriginal] = useState(0);
  const [saving, setSaving] = useState(false);

  function startCellEdit(taskId: string, week: string, current: number) {
    setEditingCell({ taskId, week });
    // Show 2 decimals (matches the cell display); full precision stays stored.
    setCellInput(current ? current.toFixed(2) : "");
    setCellOriginal(current);
  }

  async function commitCell() {
    if (!editingCell || !projectId) { setEditingCell(null); return; }
    const val = Math.max(0, parseFloat(cellInput) || 0);

    // Unchanged at 2dp (e.g. just clicked and blurred) → keep the stored
    // full-precision value instead of overwriting it with the rounded one.
    if (Math.round(val * 100) === Math.round(cellOriginal * 100)) {
      setEditingCell(null);
      return;
    }

    // Optimistic update — the grid edits the PLAN schedule
    setSteps(prev => prev.map(step => ({
      ...step,
      tasks: step.tasks.map(task => {
        if (task.id !== editingCell.taskId) return task;
        return { ...task, weeklyPlan: { ...task.weeklyPlan, [editingCell.week]: val } };
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
        body: JSON.stringify({ taskId: snap.taskId, weekDate: snap.week, mode: "plan", planPct: val }),
      });
      const j = await res.json();
      if (!j.success) {
        console.error("Save failed:", j.error);
        alert(`Gagal menyimpan: ${j.error}`);
      }
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save value. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  // ── CUM. ACTUAL editing (cumulative realisasi per week) ──────────────────────
  const [editingCumWeek, setEditingCumWeek] = useState<string | null>(null);
  const [cumInput, setCumInput] = useState("");
  const [cumOriginal, setCumOriginal] = useState<number | null>(null);

  function startCumEdit(week: string, current: number | null) {
    setEditingCumWeek(week);
    setCumInput(current != null ? current.toFixed(2) : "");
    setCumOriginal(current);
  }

  async function commitCumActual() {
    const week = editingCumWeek;
    if (!week || !projectId) { setEditingCumWeek(null); return; }
    const raw = cumInput.trim();
    setEditingCumWeek(null);

    // Cleared input → unset entirely ("not yet reported"), never store a
    // literal 0 (0% reported is a different, meaningful state that would
    // regress REALISASI/DEVIATION for this and later weeks).
    if (raw === "") {
      if (cumOriginal == null) return; // was already unset — nothing to do
      setCumActuals(prev => { const next = { ...prev }; delete next[week]; return next; });
      setSaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/scurve-week-actuals`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekDate: week }),
        });
        const j = await res.json();
        if (!j.success) { console.error("Clear failed:", j.error); alert(`Gagal menghapus: ${j.error}`); }
      } catch (err) {
        console.error("Clear error:", err);
        alert("Failed to clear value. Check your connection.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const val = Math.max(0, parseFloat(raw) || 0);
    if (cumOriginal != null && Math.round(val * 100) === Math.round(cumOriginal * 100)) return;

    // Optimistic
    setCumActuals(prev => ({ ...prev, [week]: val }));

    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/scurve-week-actuals`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekDate: week, cumActualPct: val }),
      });
      const j = await res.json();
      if (!j.success) { console.error("Save failed:", j.error); alert(`Gagal menyimpan: ${j.error}`); }
    } catch (err) {
      console.error("Save error:", err);
      alert("Failed to save value. Check your connection.");
    } finally {
      setSaving(false);
    }
  }

  // ── Setup wizard (bulk add steps + tasks when none exist) ───────────────────
  type SetupTask = { name: string; weight: string };
  type SetupRow  = { name: string; tasks: SetupTask[] };
  const [setupRows, setSetupRows] = useState<SetupRow[]>([
    { name: "Step 1", tasks: [] },
    { name: "Step 2", tasks: [] },
    { name: "Step 3", tasks: [] },
  ]);
  const [setupSaving, setSetupSaving] = useState(false);

  function setSetupStepName(i: number, v: string) {
    setSetupRows(p => p.map((r, ri) => ri === i ? { ...r, name: v } : r));
  }
  function addSetupTask(i: number) {
    setSetupRows(p => p.map((r, ri) => ri === i ? { ...r, tasks: [...r.tasks, { name: "", weight: "" }] } : r));
  }
  function setSetupTask(si: number, ti: number, field: keyof SetupTask, v: string) {
    setSetupRows(p => p.map((r, ri) => ri === si
      ? { ...r, tasks: r.tasks.map((t, tii) => tii === ti ? { ...t, [field]: v } : t) }
      : r));
  }
  function removeSetupTask(si: number, ti: number) {
    setSetupRows(p => p.map((r, ri) => ri === si ? { ...r, tasks: r.tasks.filter((_, tii) => tii !== ti) } : r));
  }

  async function createSetupSteps() {
    const valid = setupRows.filter(r => r.name.trim());
    if (!valid.length || !projectId) return;
    setSetupSaving(true);
    try {
      const created: SStep[] = [];
      for (const row of valid) {
        const res = await fetch(`/api/projects/${projectId}/scurve-steps`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: row.name.trim() }),
        });
        const j = await res.json();
        if (!j.success) continue;
        const step: SStep = { ...j.data, tasks: [] };
        for (const t of row.tasks.filter(t => t.name.trim())) {
          const tr = await fetch(`/api/projects/${projectId}/scurve-tasks`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stepId: step.id, name: t.name.trim(), bobot: parseFloat(t.weight) || 0 }),
          });
          const tj = await tr.json();
          if (tj.success) step.tasks.push({ ...tj.data, weeklyPlan: {}, weeklyActual: {} });
        }
        created.push(step);
      }
      setSteps(created);
    } finally {
      setSetupSaving(false);
    }
  }

  // ── Auto-distribute weights equally across all tasks ──────────────────────────
  const [autoWeighting, setAutoWeighting] = useState(false);
  async function autoDistributeWeights() {
    if (!projectId) return;
    const allTasks = steps.flatMap(s => s.tasks);
    if (!allTasks.length) return;
    const equal = parseFloat((100 / allTasks.length).toFixed(4));
    setAutoWeighting(true);
    try {
      await Promise.all(allTasks.map(t =>
        fetch(`/api/projects/${projectId}/scurve-tasks/${t.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bobot: equal }),
        })
      ));
      setSteps(prev => prev.map(s => ({
        ...s,
        tasks: s.tasks.map(t => ({ ...t, bobot: equal })),
      })));
    } finally {
      setAutoWeighting(false);
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

  async function deleteStep(stepId: string, stepName: string) {
    if (!projectId) return;
    if (!window.confirm(`Delete step "${stepName}" and all its tasks? This cannot be undone.`)) return;
    setSteps(prev => prev.filter(s => s.id !== stepId));
    await fetch(`/api/projects/${projectId}/scurve-steps/${stepId}`, { method: "DELETE" });
  }

  // ── Inline step name editing ──────────────────────────────────────────────────
  const [editingStepId, setEditingStepId]     = useState<string | null>(null);
  const [stepNameDraft, setStepNameDraft]     = useState("");

  async function commitStepName(stepId: string) {
    const name = stepNameDraft.trim();
    setEditingStepId(null);
    if (!name || !projectId) return;
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, name } : s));
    await fetch(`/api/projects/${projectId}/scurve-steps/${stepId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  // ── Inline task field editing ─────────────────────────────────────────────────
  const [editingTaskField, setEditingTaskField] = useState<{ taskId: string; field: "name" | "bobot" } | null>(null);
  const [taskFieldDraft, setTaskFieldDraft]     = useState("");

  async function commitTaskField(stepId: string, taskId: string, field: "name" | "bobot") {
    setEditingTaskField(null);
    if (!projectId) return;
    const raw = taskFieldDraft.trim();
    if (!raw) return;
    if (field === "name") {
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, name: raw } : t) } : s));
      await fetch(`/api/projects/${projectId}/scurve-tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: raw }),
      });
    } else {
      const bobot = parseFloat(raw) || 0;
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, bobot } : t) } : s));
      await fetch(`/api/projects/${projectId}/scurve-tasks/${taskId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bobot }),
      });
    }
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

  async function deleteTask(stepId: string, taskId: string, taskName: string) {
    if (!projectId) return;
    if (!window.confirm(`Delete task "${taskName}"?`)) return;
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, tasks: s.tasks.filter(t => t.id !== taskId) } : s));
    await fetch(`/api/projects/${projectId}/scurve-tasks/${taskId}`, { method: "DELETE" });
  }

  // ── Summary — plan from the schedule grid, actual from cumulative input ───────
  // RENCANA (per-week plan) is auto-derived from bobot; CUM. ACTUAL is entered by
  // the PM per week, and REALISASI + DEVIASI are derived (same math as Excel).
  const weeklyAutoPlan = useMemo(() => calcWeeklyPlan(steps, weeks), [steps, weeks]);

  const cumSummary = useMemo(() => {
    const actualCum = cumActualSeries(weeks, cumActuals);
    let cumR = 0;
    let prevA = 0;
    return weeks.map((w, i) => {
      const rencana = weeklyAutoPlan[w] ?? 0;
      cumR += rencana;
      const cumA = actualCum[i];               // number | null (null = not yet reported)
      const realisasi = cumA == null ? null : cumA - prevA;
      if (cumA != null) prevA = cumA;
      return {
        week: w, rencana,
        realisasi,
        cumRencana: cumR,
        cumRealisasi: cumA,
        deviasi: cumA == null ? null : (cumA - cumR),
      };
    });
  }, [steps, weeks, weeklyAutoPlan, cumActuals]);

  // ── Chart ─────────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const pmStart = parseDate(selectedProject?.pm_start) ?? undefined;
    return buildChartData(steps, weeks, cumActuals, pmStart, pmEndDate ?? undefined);
  }, [steps, weeks, cumActuals, selectedProject, pmEndDate]);
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
            {/* Auto Weights */}
            {steps.some(s => s.tasks.length > 0) && (
              <button
                onClick={autoDistributeWeights}
                disabled={autoWeighting}
                title="Distribute 100% equally across all tasks"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors disabled:opacity-40"
              >
                {autoWeighting ? <Loader2 size={11} className="animate-spin" /> : <span className="text-[10px]">∑</span>}
                Auto Weights
              </button>
            )}
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
          ) : !parseDate(selectedProject.pm_start) || !parseDate(selectedProject.pm_end) ? (
            <div className="relative overflow-hidden" style={{ height: 320 }}>
              {/* Blurred fake chart */}
              <div className="absolute inset-0 pointer-events-none opacity-30" style={{ filter: "blur(4px)" }}>
                <FakeSCurve />
              </div>
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm" />
              {/* Message */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                <div className="w-11 h-11 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-100">Set PM Phase dates to enable S-Curve</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
                    Open <span className="font-semibold text-amber-500">Project Details</span>, go to <span className="font-semibold text-amber-500">Phase Progress → PM</span>, and fill in the Start &amp; End dates.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700">
              <div style={{ minWidth: LEFT_W + weeks.length * CELL_W }}>

                {/* Month header */}
                <div className="flex border-b border-slate-200/60 dark:border-white/8 bg-slate-100/80 dark:bg-zinc-800/60">
                  <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 h-7 flex items-center px-3 gap-2" style={{ width: LEFT_W }}>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 w-8 shrink-0 text-center">NO</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 flex-1">ITEM / DESCRIPTION</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 w-10 shrink-0 text-center">UNIT</span>
                    <span className="text-[8px] uppercase tracking-widest text-slate-400 w-12 shrink-0 text-right">VOL</span>
                    <span className="text-[8px] uppercase text-slate-400 w-14 text-right shrink-0 whitespace-nowrap">WEIGHT%</span>
                    <span className="w-16 shrink-0" aria-hidden />
                  </div>
                  {monthGroups.map((mg, i) => (
                    <div key={i} style={{ width: mg.count * CELL_W }} className="h-7 flex items-center justify-center border-r border-slate-200/60 dark:border-white/8">
                      <span className="text-[8px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0 px-1">{mg.label}</span>
                    </div>
                  ))}
                </div>

                {/* Week date range row — start date / "s/d" / end date, each on
                    its own line, like the Excel schedule. Three short stacked
                    lines so it fits the narrow week column without overlap. */}
                <div className="flex border-b border-slate-200/60 dark:border-white/8 bg-slate-50/60 dark:bg-zinc-900/40">
                  <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 h-12" style={{ width: LEFT_W }} />
                  {weeks.map((w, i) => {
                    const rawStart = parseISO(w);
                    const rawEnd = addDays(rawStart, 6);
                    // Clamp the shown range to the PM phase: the first week can't
                    // start before pm_start and the last can't end after pm_end.
                    const startD = pmStartDate && pmStartDate > rawStart ? pmStartDate : rawStart;
                    const endD = pmEndDate && pmEndDate < rawEnd ? pmEndDate : rawEnd;
                    return (
                      <div
                        key={i}
                        title={`${format(startD, "d MMM yyyy")} – ${format(endD, "d MMM yyyy")}`}
                        style={{ width: CELL_W, minWidth: CELL_W }}
                        className="h-12 flex flex-col items-center justify-center gap-0.5 leading-none border-r border-slate-200/40 dark:border-white/5"
                      >
                        <span className="text-[8px] font-bold uppercase text-slate-500 dark:text-slate-300 whitespace-nowrap leading-none">{format(startD, "d MMM")}</span>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-none">s/d</span>
                        <span className="text-[8px] font-bold uppercase text-slate-500 dark:text-slate-300 whitespace-nowrap leading-none">{format(endD, "d MMM")}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Setup wizard — shown when no steps exist */}
                {steps.length === 0 && (
                  <div className="flex items-center justify-center py-10 px-6">
                    <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/60 dark:border-white/10 shadow-lg p-6 max-h-[50vh] flex flex-col">
                      <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">Setup S-Curve Steps</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-4">Add steps and tasks at once — you can edit later</p>

                      <div className="space-y-3 mb-4 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-zinc-700 pr-1">
                        {setupRows.map((row, si) => (
                          <div key={si} className="rounded-lg border border-slate-200 dark:border-white/8 overflow-hidden">
                            {/* Step name row */}
                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-zinc-800/60">
                              <span className="text-[11px] font-bold text-amber-500 w-5 shrink-0">{LETTERS[si] ?? "?"}</span>
                              <input
                                value={row.name}
                                onChange={e => setSetupStepName(si, e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && si === setupRows.length - 1) setSetupRows(p => [...p, { name: `Step ${p.length + 1}`, tasks: [] }]); }}
                                placeholder={`Step ${si + 1}`}
                                className="flex-1 bg-transparent text-sm font-semibold text-slate-800 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                              />
                              {setupRows.length > 1 && (
                                <button aria-label="Delete step" onClick={() => setSetupRows(p => p.filter((_, ri) => ri !== si))} className="text-slate-300 hover:text-rose-400 transition-colors shrink-0">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>

                            {/* Tasks under this step */}
                            {row.tasks.length > 0 && (
                              <div className="divide-y divide-slate-100 dark:divide-white/5">
                                {row.tasks.map((task, ti) => (
                                  <div key={ti} className="flex items-center gap-2 px-3 py-2.5 pl-8">
                                    <span className="text-[10px] text-slate-300 dark:text-slate-600 shrink-0">{si + 1}.{ti + 1}</span>
                                    <input
                                      value={task.name}
                                      onChange={e => setSetupTask(si, ti, "name", e.target.value)}
                                      placeholder="Task name"
                                      className="flex-1 bg-transparent text-[13px] text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                    />
                                    <input
                                      value={task.weight}
                                      onChange={e => setSetupTask(si, ti, "weight", e.target.value)}
                                      placeholder="Weight %"
                                      inputMode="decimal"
                                      className="w-24 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/8 rounded px-2 py-1 text-[13px] text-right text-slate-700 dark:text-slate-200 outline-none focus:border-amber-400"
                                    />
                                    <button aria-label="Delete task" onClick={() => removeSetupTask(si, ti)} className="text-slate-300 hover:text-rose-400 transition-colors shrink-0">
                                      <Trash2 size={12} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Add task link */}
                            <div className="px-3 pb-2 pl-8">
                              <button
                                onClick={() => addSetupTask(si)}
                                className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400 hover:text-amber-500 transition-colors mt-1"
                              >
                                <Plus size={12} /> Add task
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() => setSetupRows(p => [...p, { name: `Step ${p.length + 1}`, tasks: [] }])}
                        className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-white/10 text-[13px] font-semibold text-slate-400 hover:text-amber-500 hover:border-amber-400 dark:hover:border-amber-500/50 transition-colors mb-4 mt-1"
                      >
                        <Plus size={13} /> Add Step
                      </button>

                      <button
                        onClick={createSetupSteps}
                        disabled={!setupRows.some(r => r.name.trim()) || setupSaving}
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
                        <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 flex items-center gap-2 px-3 h-9" style={{ width: LEFT_W }}>
                          <button
                            aria-label={isCollapsed ? "Expand step" : "Collapse step"}
                            onClick={() => setCollapsed(c => { const n = new Set(c); n.has(step.id) ? n.delete(step.id) : n.add(step.id); return n; })}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors shrink-0"
                          >
                            {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </button>
                          <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 w-5 shrink-0">{step.letter}</span>
                          {editingStepId === step.id ? (
                            <input
                              autoFocus
                              value={stepNameDraft}
                              onChange={e => setStepNameDraft(e.target.value)}
                              onBlur={() => commitStepName(step.id)}
                              onKeyDown={e => { if (e.key === "Enter") commitStepName(step.id); if (e.key === "Escape") setEditingStepId(null); }}
                              className="flex-1 bg-white/10 dark:bg-white/5 border border-amber-400/60 rounded px-1.5 text-[11px] font-bold text-slate-800 dark:text-white outline-none uppercase tracking-wide"
                            />
                          ) : (
                            <span
                              onClick={() => { setEditingStepId(step.id); setStepNameDraft(step.name); }}
                              className="text-[11px] font-bold text-slate-700 dark:text-slate-100 flex-1 truncate uppercase tracking-wide cursor-text hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                            >{step.name}</span>
                          )}
                          <span className="text-[9px] font-bold text-slate-500 dark:text-slate-400 shrink-0 w-14 text-right">{stepBobot > 0 ? stepBobot.toFixed(2) : ""}</span>
                          <div className="w-16 shrink-0 flex items-center justify-end gap-1">
                            <button
                              onClick={() => { setTaskForm({ name: "", unit: "", vol: "", weight: "" }); setAddTaskStep(step.id); }}
                              className="flex items-center gap-0.5 text-[9px] font-bold text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors shrink-0 px-1"
                            >
                              <Plus size={9} /> Task
                            </button>
                            <button aria-label="Delete step" onClick={() => deleteStep(step.id, step.name)} className="opacity-0 group-hover/step:opacity-100 text-slate-400 hover:text-rose-500 dark:text-white/30 dark:hover:text-rose-400 transition-all shrink-0">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        {weeks.map((_, wi) => (
                          <div key={wi} style={{ width: CELL_W, minWidth: CELL_W }} className="h-9 border-r border-slate-200/30 dark:border-white/4" />
                        ))}
                      </div>

                      {/* Task rows */}
                      {!isCollapsed && step.tasks.map((task, ti) => {
                        return (
                          <div key={task.id} className="flex items-stretch border-b border-slate-200/40 dark:border-white/5 hover:bg-slate-50/40 dark:hover:bg-white/1.5 group/task">
                            <div className="shrink-0 border-r border-slate-200/60 dark:border-white/8 flex items-center gap-2 px-3 py-1.5 min-h-12" style={{ width: LEFT_W }}>
                              <span className="text-[9px] text-slate-400 w-8 shrink-0 text-center self-start mt-0.5">{si + 1}.{ti + 1}</span>
                              {editingTaskField?.taskId === task.id && editingTaskField.field === "name" ? (
                                <input
                                  autoFocus
                                  value={taskFieldDraft}
                                  onChange={e => setTaskFieldDraft(e.target.value)}
                                  onBlur={() => commitTaskField(step.id, task.id, "name")}
                                  onKeyDown={e => { if (e.key === "Enter") commitTaskField(step.id, task.id, "name"); if (e.key === "Escape") setEditingTaskField(null); }}
                                  className="flex-1 bg-white/10 dark:bg-white/5 border border-amber-400/60 rounded px-1.5 text-[11px] text-slate-800 dark:text-white outline-none"
                                />
                              ) : (
                                <span
                                  onClick={() => { setEditingTaskField({ taskId: task.id, field: "name" }); setTaskFieldDraft(task.name); }}
                                  className="text-[11px] text-slate-700 dark:text-slate-200 flex-1 whitespace-normal break-words leading-snug cursor-text hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                                >{task.name}</span>
                              )}
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 w-10 shrink-0 text-center self-start mt-0.5">{task.unit || "—"}</span>
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 w-12 shrink-0 text-right self-start mt-0.5">{task.vol || "—"}</span>
                              {editingTaskField?.taskId === task.id && editingTaskField.field === "bobot" ? (
                                <input
                                  autoFocus
                                  value={taskFieldDraft}
                                  inputMode="decimal"
                                  onChange={e => setTaskFieldDraft(e.target.value)}
                                  onBlur={() => commitTaskField(step.id, task.id, "bobot")}
                                  onKeyDown={e => { if (e.key === "Enter") commitTaskField(step.id, task.id, "bobot"); if (e.key === "Escape") setEditingTaskField(null); }}
                                  className="w-14 self-start bg-white/10 dark:bg-white/5 border border-amber-400/60 rounded px-1.5 text-[10px] font-bold text-right text-slate-800 dark:text-white outline-none"
                                />
                              ) : (
                                <span
                                  onClick={() => { setEditingTaskField({ taskId: task.id, field: "bobot" }); setTaskFieldDraft(String(task.bobot)); }}
                                  className="text-[10px] font-bold text-slate-600 dark:text-slate-300 w-14 text-right shrink-0 self-start mt-0.5 cursor-text hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                                >{task.bobot.toFixed(2)}</span>
                              )}
                              <div className="w-16 shrink-0 flex items-center justify-end self-start mt-0.5">
                                <button aria-label="Delete task" onClick={() => deleteTask(step.id, task.id, task.name)} className="opacity-0 group-hover/task:opacity-100 text-slate-400 hover:text-rose-500 dark:text-white/30 dark:hover:text-rose-400 transition-all shrink-0">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                            {weeks.map((w, wi) => {
                              const v = task.weeklyPlan[w] ?? 0;
                              const isEditing = editingCell?.taskId === task.id && editingCell.week === w;
                              return (
                                <div
                                  key={wi}
                                  style={{ width: CELL_W, minWidth: CELL_W }}
                                  className={`min-h-12 border-r border-slate-200/30 dark:border-white/4 flex items-center justify-center ${v > 0 ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
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
                                      className="w-full h-full flex items-center justify-center text-[10px] font-semibold hover:bg-blue-100/80 dark:hover:bg-blue-900/30 hover:ring-1 hover:ring-inset hover:ring-blue-300 dark:hover:ring-blue-700 transition-all cursor-pointer"
                                    >
                                      {v > 0
                                        ? <span className="text-blue-600 dark:text-blue-400 font-bold">{v.toFixed(2)}</span>
                                        : <span className="text-slate-300 dark:text-slate-600 text-[9px] group-hover/task:text-blue-400 dark:group-hover/task:text-blue-600 transition-colors">+</span>
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

                          // CUM. ACTUAL — editable: PM enters the cumulative realisasi per week
                          if (row.key === "cumRealisasi") {
                            const isEditing = editingCumWeek === s.week;
                            const raw = cumActuals[s.week];
                            return (
                              <div key={wi} style={{ width: CELL_W, minWidth: CELL_W }} className="h-7 border-r border-slate-200/30 dark:border-white/4 flex items-center justify-center">
                                {isEditing ? (
                                  <input
                                    autoFocus
                                    value={cumInput}
                                    onChange={e => setCumInput(e.target.value)}
                                    onBlur={commitCumActual}
                                    onKeyDown={e => { if (e.key === "Enter") commitCumActual(); if (e.key === "Escape") setEditingCumWeek(null); }}
                                    className="w-full h-full text-center text-[9px] font-bold bg-amber-50 dark:bg-amber-950/30 outline-none border-0 text-amber-700 dark:text-amber-300"
                                    placeholder="0.00"
                                  />
                                ) : (
                                  <button
                                    onClick={() => startCumEdit(s.week, raw ?? v)}
                                    className="w-full h-full flex items-center justify-center hover:bg-emerald-100/80 dark:hover:bg-emerald-900/30 hover:ring-1 hover:ring-inset hover:ring-emerald-300 dark:hover:ring-emerald-700 transition-all cursor-pointer"
                                  >
                                    {v !== null && v !== 0
                                      ? <span className={`text-[9px] font-bold ${cls}`}>{v.toFixed(2)}</span>
                                      : <span className="text-slate-300 dark:text-slate-600 text-[9px]">+</span>}
                                  </button>
                                )}
                              </div>
                            );
                          }

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
          {!loading && hasPmDates && weeks.length > 0 && (
            <div className="border-t border-slate-200/60 dark:border-white/8 relative" style={{ height: 440 }}>
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
                <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 440 }}>
                  <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 48, left: 4 }}>
                    <CartesianGrid horizontal vertical={false} strokeDasharray="4 4" stroke="rgba(148,163,184,0.35)" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor" }} tickLine={false} axisLine={false} interval="preserveStartEnd" padding={{ left: 24, right: 8 }} tickMargin={8} />
                    <YAxis domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} interval={0} tick={{ fontSize: 9, fill: "currentColor" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={34} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="linear" dataKey="plan" name="Planned Target" stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls isAnimationActive animationDuration={650} animationEasing="ease-in-out" />
                    <Line type="linear" dataKey="actualAhead" name="Actual Progress" stroke="#22c55e" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive animationDuration={650} animationEasing="ease-in-out" />
                    <Line type="linear" dataKey="actualBehind" name="Actual Progress" stroke="#ef4444" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive animationDuration={650} animationEasing="ease-in-out" />
                  </LineChart>
                </ResponsiveContainer>
              )}
              <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-5 pointer-events-none">
                <div className="flex items-center gap-1.5">
                  <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#3b82f6" strokeWidth="3" /></svg>
                  <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">Planned</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#22c55e" strokeWidth="3" /></svg>
                  <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-500">Actual (on track)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#ef4444" strokeWidth="3" /></svg>
                  <span className="text-[9px] font-semibold text-rose-600 dark:text-rose-500">Actual (behind)</span>
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
                placeholder="e.g. PRELIMINARY, WALL WORKS..."
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
