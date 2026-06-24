"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Area, ReferenceLine,
} from "recharts";
import { format, addWeeks, differenceInCalendarDays, isAfter } from "date-fns";
import { Activity, Plus, X, Check, Trash2 } from "lucide-react";
import AnimatedDropdown from "./AnimatedDropdown";

// ── Types ─────────────────────────────────────────────────────────────────────

type Project = {
  id: string;
  project_name: string;
  unit_code: string | null;
  unit_name: string | null;
};

type DBTask = {
  id: string;
  title: string;
  weight_pct: number;
  progress_pct: number;
  item_order: number;
};

type Timelines = Record<string, { start: string; end: string }>;
type ChartPoint = { label: string; plan: number; actual: number | null };
type ModalRow = { name: string; weight: string; start: string; end: string };

// ── Chart data builder ────────────────────────────────────────────────────────

function buildChartData(tasks: DBTask[], timelines: Timelines): ChartPoint[] {
  const entries = tasks
    .map(t => ({ task: t, tl: timelines[t.id] }))
    .filter(e => e.tl?.start && e.tl?.end);
  if (!entries.length) return [];

  const starts = entries.map(e => new Date(e.tl!.start).getTime());
  const ends   = entries.map(e => new Date(e.tl!.end).getTime());
  const projectStart = new Date(Math.min(...starts));
  const projectEnd   = new Date(Math.max(...ends));
  const today = new Date();

  const points: ChartPoint[] = [];
  let cursor = new Date(projectStart);

  while (cursor <= projectEnd) {
    let planSum = 0;
    let actualSum = 0;
    const isPast = !isAfter(cursor, today);

    for (const { task, tl } of entries) {
      const tStart  = new Date(tl!.start);
      const tEnd    = new Date(tl!.end);
      const dur     = Math.max(1, differenceInCalendarDays(tEnd, tStart));
      const elapsed = Math.min(dur, Math.max(0, differenceInCalendarDays(cursor, tStart)));
      const ratio   = elapsed / dur;

      planSum += ratio * task.weight_pct;
      if (isPast) {
        const expPct = ratio * 100;
        actualSum += (Math.min(expPct, task.progress_pct) / 100) * task.weight_pct;
      }
    }

    points.push({
      label: format(cursor, "dd MMM yy"),
      plan: Number(planSum.toFixed(2)),
      actual: isPast ? Number(actualSum.toFixed(2)) : null,
    });

    cursor = addWeeks(cursor, 1);
  }

  return points;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipPayload { dataKey: string; value: number | null; color: string; name: string }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 px-3 py-2 shadow-xl bg-white/95 dark:bg-zinc-950/96 backdrop-blur-xl">
      <p className="text-[10px] font-bold text-slate-500 dark:text-white/50 mb-1">{label}</p>
      {payload.filter(p => p.value !== null).map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
          <span className="text-slate-500 dark:text-white/60">{p.name}:</span>
          <span className="font-bold text-slate-900 dark:text-white">{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

// ── Fake S-curve background (blurred state) ───────────────────────────────────

function FakeSCurve() {
  return (
    <div className="absolute inset-0 p-8">
      <svg viewBox="0 0 500 220" preserveAspectRatio="none" className="w-full h-full">
        <defs>
          <linearGradient id="fp2Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fa2Grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[55, 110, 165].map(y => (
          <line key={y} x1="0" y1={y} x2="500" y2={y}
            stroke="rgba(148,163,184,0.25)" strokeWidth="1" />
        ))}
        <path d="M0,210 C80,200 130,160 190,110 C250,58 330,18 500,5 L500,220 L0,220 Z"
          fill="url(#fp2Grad)" />
        <path d="M0,210 C80,206 130,178 180,148 C230,112 280,68 340,48 L340,220 L0,220 Z"
          fill="url(#fa2Grad)" />
        <path d="M0,210 C80,200 130,160 190,110 C250,58 330,18 500,5"
          fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="6 3" opacity="0.9" />
        <path d="M0,210 C80,206 130,178 180,148 C230,112 280,68 340,48"
          fill="none" stroke="#22c55e" strokeWidth="3" opacity="0.9" />
      </svg>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PerformanceAnalysis({ projects }: { projects: Project[] }) {
  const [selectedUnit, setSelectedUnit]           = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [tasks, setTasks]                         = useState<DBTask[]>([]);
  const [timelines, setTimelines]                 = useState<Timelines>({});
  const [showModal, setShowModal]                 = useState(false);
  const [modalRows, setModalRows]                 = useState<ModalRow[]>([{ name: "", weight: "", start: "", end: "" }]);
  const [saving, setSaving]                       = useState(false);
  const [editingProgress, setEditingProgress]     = useState<Record<string, string>>({});

  const unitOptions = useMemo(() => {
    const units = Array.from(new Set(projects.map(p => p.unit_code).filter(Boolean))).sort() as string[];
    return [
      { value: "", label: "Select Unit" },
      ...units.map(u => ({ value: u, label: u })),
    ];
  }, [projects]);

  const projectOptions = useMemo(() => {
    if (!selectedUnit) return [{ value: "", label: "Select Project" }];
    return [
      { value: "", label: "Select Project" },
      ...projects
        .filter(p => p.unit_code === selectedUnit)
        .map(p => {
          const parts = p.project_name.split(" - ");
          const name  = parts.length > 1 ? parts.slice(1).join(" - ") : p.project_name;
          return { value: p.id, label: name };
        }),
    ];
  }, [projects, selectedUnit]);

  const loadTasks = useCallback((pid: string) => {
    fetch(`/api/projects/${pid}/tasks`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setTasks((j.data ?? []).map((t: DBTask) => ({
            ...t,
            weight_pct: Number(t.weight_pct),
            progress_pct: Number(t.progress_pct),
          })));
        }
      })
      .catch(() => {});
  }, []);

  const loadTimelines = useCallback((pid: string) => {
    try {
      const raw = localStorage.getItem(`perf_timelines_${pid}`);
      setTimelines(raw ? (JSON.parse(raw) as Timelines) : {});
    } catch {
      setTimelines({});
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) { setTasks([]); setTimelines({}); return; }
    loadTasks(selectedProjectId);
    loadTimelines(selectedProjectId);
  }, [selectedProjectId, loadTasks, loadTimelines]);

  const chartData = useMemo(() => buildChartData(tasks, timelines), [tasks, timelines]);

  // A project is "ready" only when at least one task has a timeline saved
  const hasTasks = tasks.length > 0 && tasks.some(t => timelines[t.id]);

  async function deleteTask(taskId: string) {
    if (!selectedProjectId) return;
    await fetch(`/api/projects/${selectedProjectId}/tasks`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    const newTl = { ...timelines };
    delete newTl[taskId];
    localStorage.setItem(`perf_timelines_${selectedProjectId}`, JSON.stringify(newTl));
    setTimelines(newTl);
    loadTasks(selectedProjectId);
  }

  async function updateProgress(taskId: string, val: string) {
    if (!selectedProjectId) return;
    const num = Math.min(100, Math.max(0, Number(val) || 0));
    await fetch(`/api/projects/${selectedProjectId}/tasks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, progress_pct: num }),
    });
    loadTasks(selectedProjectId);
  }

  async function saveModalTasks() {
    if (!selectedProjectId) return;
    const valid = modalRows.filter(r => r.name.trim() && r.start && r.end);
    if (!valid.length) return;
    setSaving(true);
    try {
      const newTimelines = { ...timelines };
      for (const r of valid) {
        const res = await fetch(`/api/projects/${selectedProjectId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: r.name.trim(), weight_pct: Number(r.weight) || 0, progress_pct: 0 }),
        });
        const j = await res.json();
        if (j.success && j.data?.id) {
          newTimelines[j.data.id] = { start: r.start, end: r.end };
        }
      }
      localStorage.setItem(`perf_timelines_${selectedProjectId}`, JSON.stringify(newTimelines));
      setTimelines(newTimelines);
      loadTasks(selectedProjectId);
      setShowModal(false);
      setModalRows([{ name: "", weight: "", start: "", end: "" }]);
    } finally {
      setSaving(false);
    }
  }

  function openModal() {
    setModalRows([{ name: "", weight: "", start: "", end: "" }]);
    setShowModal(true);
  }

  const todayLabel = format(new Date(), "dd MMM yy");
  const planColor  = "#3b82f6";
  const actColor   = "#22c55e";

  return (
    <div className="rounded-xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm p-4 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <span className="w-1.5 h-4 bg-cyan-500 rounded-full" />
            Project Performance Analysis
          </h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 font-medium uppercase tracking-wider">
            S-Curve · Plan vs Actual
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AnimatedDropdown
            value={selectedUnit}
            options={unitOptions}
            onChange={val => { setSelectedUnit(val); setSelectedProjectId(""); }}
            minWidth={160}
            align="right"
          />
          <AnimatedDropdown
            value={selectedProjectId}
            options={projectOptions}
            onChange={setSelectedProjectId}
            minWidth={200}
            align="right"
            disabled={!selectedUnit}
          />
          {hasTasks && (
            <button
              onClick={openModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold glass-btn-primary text-white"
            >
              <Plus size={12} /> Add Task
            </button>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      {!selectedProjectId ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
          <Activity size={28} className="mb-3 opacity-20" />
          <p className="text-sm font-medium">Select a Unit and Project</p>
          <p className="text-xs mt-1">S-Curve analysis will appear here</p>
        </div>

      ) : !hasTasks ? (
        /* ── Locked / blurred state ── */
        <div className="relative rounded-lg overflow-hidden border border-slate-200/60 dark:border-white/10" style={{ minHeight: 320 }}>
          {/* Blurred chart backdrop */}
          <div className="absolute inset-0 pointer-events-none" style={{ filter: "blur(5px)", opacity: 0.45 }}>
            <FakeSCurve />
          </div>
          {/* Dim overlay */}
          <div className="absolute inset-0 bg-white/60 dark:bg-zinc-900/60" />
          {/* CTA card */}
          <div className="relative z-10 flex items-center justify-center" style={{ minHeight: 320 }}>
            <div className="text-center px-6 py-8 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl shadow-2xl max-w-xs w-full mx-4">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center mx-auto mb-3">
                <Activity size={22} className="text-cyan-500" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-1">Start S-Curve Analysis</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Add tasks with weights and timeline to start project performance analysis.
              </p>
              <button
                onClick={openModal}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold glass-btn-primary text-white mx-auto"
              >
                <Plus size={14} /> Add Task
              </button>
            </div>
          </div>
        </div>

      ) : (
        /* ── Unlocked state ── */
        <div className="flex flex-col gap-4">

          {/* Task list table */}
          <div className="rounded-lg border border-slate-200/60 dark:border-white/10 overflow-hidden">
            <div
              className="grid text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-zinc-900/60 border-b border-slate-200/60 dark:border-white/8"
              style={{ gridTemplateColumns: "1fr 72px 110px 110px 96px 32px" }}
            >
              <div className="px-3 py-2">Task</div>
              <div className="px-2 py-2 text-center">Weight</div>
              <div className="px-2 py-2 text-center">Start</div>
              <div className="px-2 py-2 text-center">End</div>
              <div className="px-2 py-2 text-center text-emerald-500">Actual %</div>
              <div />
            </div>
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {tasks.map(task => {
                const tl = timelines[task.id];
                const progVal = editingProgress[task.id] ?? String(task.progress_pct);
                return (
                  <div
                    key={task.id}
                    className="grid items-center text-[11px] hover:bg-slate-50/50 dark:hover:bg-white/3 transition-colors"
                    style={{ gridTemplateColumns: "1fr 72px 110px 110px 96px 32px" }}
                  >
                    <div className="px-3 py-2.5 text-slate-700 dark:text-slate-200 truncate">{task.title}</div>
                    <div className="px-2 py-2.5 text-center font-mono text-slate-500 dark:text-slate-400">{task.weight_pct.toFixed(1)}%</div>
                    <div className="px-2 py-2.5 text-center text-slate-500 dark:text-slate-400 text-[10px]">{tl?.start ?? "—"}</div>
                    <div className="px-2 py-2.5 text-center text-slate-500 dark:text-slate-400 text-[10px]">{tl?.end ?? "—"}</div>
                    <div className="px-2 py-2.5 flex items-center justify-center gap-1">
                      <input
                        type="number" min="0" max="100" step="1"
                        value={progVal}
                        onChange={e => setEditingProgress(prev => ({ ...prev, [task.id]: e.target.value }))}
                        onBlur={e => {
                          updateProgress(task.id, e.target.value);
                          setEditingProgress(prev => { const n = { ...prev }; delete n[task.id]; return n; });
                        }}
                        className="w-12 text-center text-[11px] font-mono rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-800 px-1.5 py-0.5 outline-none focus:border-emerald-400 text-emerald-600 dark:text-emerald-400"
                      />
                      <span className="text-[10px] text-slate-400">%</span>
                    </div>
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="flex items-center justify-center h-full pr-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* S-curve chart */}
          {chartData.length > 0 && (
            <div className="rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-zinc-950/30 overflow-hidden">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={chartData} margin={{ top: 16, right: 16, bottom: 8, left: 0 }}>
                  <defs>
                    <linearGradient id="perfPlanGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={planColor} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={planColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="perfActGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={actColor} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={actColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: "rgba(148,163,184,0.7)" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 9, fill: "rgba(148,163,184,0.7)" }}
                    tickLine={false}
                    width={36}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {chartData.some(p => p.label === todayLabel) && (
                    <ReferenceLine
                      x={todayLabel}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{ value: "Today", position: "top", fill: "#f59e0b", fontSize: 9 }}
                    />
                  )}
                  <Area dataKey="plan"   fill="url(#perfPlanGrad)" stroke="none" />
                  <Area dataKey="actual" fill="url(#perfActGrad)"  stroke="none" />
                  <Line dataKey="plan"   stroke={planColor} strokeWidth={2}   strokeDasharray="6 3" dot={false} name="Planned" />
                  <Line dataKey="actual" stroke={actColor}  strokeWidth={2.5} dot={false} connectNulls name="Actual" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-6 px-4 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5" style={{ background: "repeating-linear-gradient(90deg,#3b82f6 0,#3b82f6 6px,transparent 6px,transparent 9px)" }} />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Planned</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-0.5 rounded-full bg-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Actual</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Task Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !saving && setShowModal(false)}
          />
          <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-xl border border-slate-200/60 dark:border-white/10 shadow-2xl overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200/60 dark:border-white/8">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Add Tasks</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Fill in task name, weight, and timeline — then click Confirm to display the S-Curve
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                disabled={saving}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-slate-400 transition-colors disabled:opacity-40"
              >
                <X size={14} />
              </button>
            </div>

            {/* Column headers */}
            <div
              className="grid gap-2 px-5 py-2 bg-slate-50/60 dark:bg-zinc-800/40 border-b border-slate-200/40 dark:border-white/5 text-[9px] font-bold uppercase tracking-widest text-slate-400"
              style={{ gridTemplateColumns: "1fr 90px 130px 130px 32px" }}
            >
              <div>Task Name</div>
              <div className="text-center">Weight (%)</div>
              <div className="text-center">Start Date</div>
              <div className="text-center">End Date</div>
              <div />
            </div>

            {/* Input rows */}
            <div className="divide-y divide-slate-100 dark:divide-white/5 max-h-64 overflow-y-auto">
              {modalRows.map((row, idx) => (
                <div
                  key={idx}
                  className="grid items-center gap-2 px-5 py-2"
                  style={{ gridTemplateColumns: "1fr 90px 130px 130px 32px" }}
                >
                  <input
                    value={row.name}
                    onChange={e => setModalRows(prev => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                    placeholder="Nama pekerjaan..."
                    className="text-[12px] bg-white dark:bg-zinc-800 border border-slate-200/70 dark:border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 text-slate-700 dark:text-slate-200 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                  />
                  <input
                    value={row.weight}
                    onChange={e => setModalRows(prev => prev.map((r, i) => i === idx ? { ...r, weight: e.target.value } : r))}
                    placeholder="0"
                    type="number" min="0" max="100" step="0.1"
                    className="text-[12px] bg-slate-50 dark:bg-white/4 border border-slate-200/70 dark:border-white/10 rounded-lg px-2 py-1.5 outline-none focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 text-center font-mono text-slate-700 dark:text-slate-200"
                  />
                  <input
                    value={row.start}
                    onChange={e => setModalRows(prev => prev.map((r, i) => i === idx ? { ...r, start: e.target.value } : r))}
                    type="date"
                    className="text-[12px] bg-slate-50 dark:bg-white/4 border border-slate-200/70 dark:border-white/10 rounded-lg px-2 py-1.5 outline-none focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 text-slate-700 dark:text-slate-200"
                  />
                  <input
                    value={row.end}
                    onChange={e => setModalRows(prev => prev.map((r, i) => i === idx ? { ...r, end: e.target.value } : r))}
                    type="date"
                    className="text-[12px] bg-slate-50 dark:bg-white/4 border border-slate-200/70 dark:border-white/10 rounded-lg px-2 py-1.5 outline-none focus:border-brand-sienna/60 focus:ring-1 focus:ring-brand-sienna/20 text-slate-700 dark:text-slate-200"
                  />
                  <button
                    onClick={() => setModalRows(prev => prev.filter((_, i) => i !== idx))}
                    disabled={modalRows.length === 1}
                    className="flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-rose-500 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-slate-200/60 dark:border-white/8 flex items-center justify-between gap-3">
              <button
                onClick={() => setModalRows(prev => [...prev, { name: "", weight: "", start: "", end: "" }])}
                disabled={saving}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-cyan-500 disabled:opacity-40 transition-colors"
              >
                <Plus size={12} /> Add Row
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-[12px] font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/8 disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveModalTasks}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] font-bold glass-btn-primary text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : <><Check size={12} /> Confirm</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
