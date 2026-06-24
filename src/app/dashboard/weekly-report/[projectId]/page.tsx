"use client";

import { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  format, addDays, parseISO, isValid, getISOWeek, getISOWeekYear,
  startOfISOWeek, eachWeekOfInterval,
} from "date-fns";
import {
  ArrowLeft, Camera, CalendarRange, ChevronLeft, ChevronRight,
  MapPin, User, Users, Building2, TrendingUp, CheckSquare, Square, ExternalLink,
} from "lucide-react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type Person = {
  id: string;
  raw_person_name: string | null;
  raw_organization_name: string | null;
  is_primary: boolean;
  role_code: string | null;
  role_name: string | null;
  full_name: string | null;
  job_title: string | null;
};

type Project = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: string | null;
  address: string | null;
  summary_brief: string | null;
  unit_name: string | null;
  unit_code: string | null;
  category_name: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  priority_name: string | null;
  priority_color: string | null;
  status_label: string | null;
  status_color: string | null;
  start_date: string | null;
  end_date: string | null;
  // Phase dates
  brief_received: string | null; brief_deadline: string | null; brief_progress: string | null; brief_notes: string | null;
  design_start: string | null;   design_end: string | null;     design_progress: string | null; design_notes: string | null;
  control_start: string | null;  control_end: string | null;    control_progress: string | null;
  pm_start: string | null;       pm_end: string | null;         pm_progress: string | null; pm_notes: string | null; current_site_progress: string | null;
  handover_start: string | null; handover_end: string | null;   handover_progress: string | null;
  // Phase advance notes
  brief_advance_note: string | null; design_advance_note: string | null;
  control_advance_note: string | null; pm_advance_note: string | null;
  [key: string]: unknown;
};

type Photo = { id: string; file_name: string; file_url: string; mime_type: string | null; uploaded_by_name: string | null };
type WeekProgress = { plan_pct: number; actual_pct: number; status: string };
type SubTask = { id: string; title: string; progress_pct: number; phase_id: string | null; raw_assignee_name: string | null; raw_assigned_by_name: string | null };

type STask = { id: string; name: string; bobot: number; weeklyActual: Record<string, number>; weeklyPlan: Record<string, number> };
type SStep = { id: string; letter: string; name: string; step_order: number; tasks: STask[] };
type ChartPoint = { label: string; plan: number; actual: number | null };

// ── Constants ────────────────────────────────────────────────────────────────

const PHASE_STEPS = [
  { code: "operational_brief",  label: "Brief",    color: "#64748b" },
  { code: "design",             label: "Design",   color: "#3b82f6" },
  { code: "project_control",    label: "Control",  color: "#f59e0b" },
  { code: "project_management", label: "PM",       color: "#14b8a6" },
  { code: "handover",           label: "Handover", color: "#22c55e" },
] as const;

const PHASE_COLORS: Record<string, string> = {
  operational_brief: "#64748b", design: "#3b82f6",
  project_control: "#f59e0b", project_management: "#14b8a6", handover: "#22c55e",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function nowWIB(): Date {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60_000;
  return new Date(utc + 7 * 3_600_000);
}
function toWeekVal(d: Date) { return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, "0")}`; }
function weekValToMonday(val: string): Date | null {
  const m = val.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const jan4 = new Date(parseInt(m[1]), 0, 4);
  const dow = jan4.getDay() || 7;
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate() - (dow - 1) + (parseInt(m[2]) - 1) * 7);
  return mon;
}
function weekKey(monday: Date) { return `week-${format(monday, "yyyy-MM-dd")}`; }
function fmtD(s: string | null) { if (!s) return ""; const d = parseISO(s); return isValid(d) ? format(d, "d MMM") : ""; }
function fmtFull(s: string | null) { if (!s) return ""; const d = parseISO(s); return isValid(d) ? format(d, "d MMM yyyy") : ""; }

function buildWeeks(startRaw: string | null, endRaw: string | null) {
  const s = startRaw ? parseISO(startRaw) : null;
  const e = endRaw   ? parseISO(endRaw)   : null;
  if (!s || !isValid(s) || !e || !isValid(e) || s > e) return [];
  return eachWeekOfInterval({ start: s, end: e }, { weekStartsOn: 1 }).map((mon, i) => {
    const sun = addDays(mon, 6);
    return { weekNum: i + 1, weekKey: `week-${format(mon, "yyyy-MM-dd")}`, monday: mon, weekEnd: sun > e ? e : sun, range: `${format(mon, "d MMM")} – ${format(sun > e ? e : sun, "d MMM yyyy")}` };
  });
}

// ── S-Curve helpers ───────────────────────────────────────────────────────────

function parseApiSteps(data: { id: string; letter: string; name: string; step_order: number; tasks: { id: string; name: string; bobot: number; task_order: number; weeks: { week_date: string; plan_pct: number; actual_pct: number }[] }[] }[]): SStep[] {
  return data.map(s => ({
    id: s.id, letter: s.letter, name: s.name, step_order: s.step_order,
    tasks: s.tasks.map(t => ({
      id: t.id, name: t.name, bobot: t.bobot,
      weeklyPlan:   Object.fromEntries(t.weeks.map(w => [w.week_date, w.plan_pct])),
      weeklyActual: Object.fromEntries(t.weeks.map(w => [w.week_date, w.actual_pct !== 0 ? w.actual_pct : w.plan_pct])),
    })),
  }));
}

function calcWeeklyPlan(steps: SStep[], weeks: string[]): Record<string, number> {
  const n = weeks.length; if (!n) return {};
  const res: Record<string, number> = {};
  for (const w of weeks) res[w] = 0;
  for (const s of steps) for (const t of s.tasks) { const pw = t.bobot / n; for (const w of weeks) res[w] += pw; }
  return res;
}

function buildChartData(steps: SStep[], weeks: string[], pmStart?: Date): ChartPoint[] {
  if (!weeks.length) return [];
  const plan = calcWeeklyPlan(steps, weeks);
  const totals = weeks.map(w => steps.reduce((sum, s) => sum + s.tasks.reduce((ts, t) => ts + (t.weeklyActual[w] ?? 0), 0), 0));
  const lastIdx = totals.reduceRight((f, v, i) => f === -1 && v > 0 ? i : f, -1);
  const hasActual = lastIdx >= 0;
  let cp = 0, ca = 0;
  const origin = pmStart ?? addDays(parseISO(weeks[0]), -7);
  const pts: ChartPoint[] = [{ label: format(origin, "d MMM"), plan: 0, actual: hasActual ? 0 : null }];
  for (let i = 0; i < weeks.length; i++) {
    cp = Math.min(100, cp + (plan[weeks[i]] ?? 0));
    ca = Math.min(100, ca + totals[i]);
    pts.push({ label: format(parseISO(weeks[i]), "d MMM"), plan: Number(cp.toFixed(2)), actual: hasActual && i <= lastIdx ? Number(ca.toFixed(2)) : null });
  }
  return pts;
}

function statusColor(s: string) {
  if (s === "Completed")   return "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10";
  if (s === "On progress") return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10";
  if (s === "Delayed")     return "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10";
  return "text-slate-400 bg-slate-100 dark:bg-white/5";
}
function statusDot(s: string) {
  if (s === "Completed") return "bg-emerald-500";
  if (s === "On progress") return "bg-blue-500";
  if (s === "Delayed") return "bg-amber-500";
  return "bg-slate-400";
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={15} className="text-slate-400 shrink-0" />
      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">{title}</h3>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ProjectReportPage() {
  const router       = useRouter();
  const params       = useParams();
  const searchParams = useSearchParams();
  const projectId    = params.projectId as string;

  const initialWeek = searchParams.get("week") ?? toWeekVal(nowWIB());
  const [selectedWeekVal, setSelectedWeekVal] = useState(initialWeek);

  const [project,  setProject]  = useState<Project | null>(null);
  const [people,   setPeople]   = useState<Person[]>([]);
  const [tasks,    setTasks]    = useState<SubTask[]>([]);
  const [photos,   setPhotos]   = useState<Photo[]>([]);
  const [weekProg, setWeekProg] = useState<WeekProgress | null>(null);
  const [scSteps,  setScSteps]  = useState<SStep[]>([]);
  const [phaseIdToLabel, setPhaseIdToLabel] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<Photo | null>(null);
  const [loading,  setLoading]  = useState(true);

  const selectedMonday  = weekValToMonday(selectedWeekVal) ?? startOfISOWeek(nowWIB());
  const selectedWeekKey = weekKey(selectedMonday);

  // Fetch project detail + people + tasks
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${projectId}`, { cache: "no-store" }).then(r => r.json()),
      fetch(`/api/projects/${projectId}/tasks`).then(r => r.json()),
    ]).then(([detailRes, tasksRes]) => {
      if (detailRes.success) {
        setProject(detailRes.data.project);
        setPeople(detailRes.data.people ?? []);
        const p = detailRes.data.project;
        setPhaseIdToLabel({
          [p.brief_phase_row_id]:    "Operational Brief",
          [p.design_phase_row_id]:   "Design",
          [p.control_phase_row_id]:  "Project Control",
          [p.pm_phase_row_id]:       "Project Management",
          [p.handover_phase_row_id]: "Handover",
        });
      }
      if (tasksRes.success) setTasks(tasksRes.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [projectId]);

  // Fetch S-curve (PM phase only)
  useEffect(() => {
    if (!project) return;
    if (project.current_phase_code !== "project_management") { setScSteps([]); return; }
    fetch(`/api/projects/${projectId}/scurve-steps`, { cache: "no-store" })
      .then(r => r.json()).then(j => { if (j.success) setScSteps(parseApiSteps(j.data)); }).catch(() => {});
  }, [project, projectId]);

  // Fetch week photos + progress when week or project changes
  useEffect(() => {
    if (!project) return;
    if (project.current_phase_code !== "project_management") { setPhotos([]); setWeekProg(null); return; }
    Promise.all([
      fetch(`/api/projects/${projectId}/attachments?week_key=${selectedWeekKey}`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/week-progress`).then(r => r.json()),
    ]).then(([attachRes, progRes]) => {
      if (attachRes.success) {
        setPhotos((attachRes.data as Photo[]).filter(
          p => (p.mime_type ?? "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(p.file_name)
        ));
      }
      const row = progRes.success ? progRes.data.find((d: { week_key: string }) => d.week_key === selectedWeekKey) : null;
      setWeekProg(row
        ? { plan_pct: Number(row.plan_pct), actual_pct: Number(row.actual_pct), status: row.status ?? "Not started" }
        : { plan_pct: 0, actual_pct: 0, status: "Not started" });
    }).catch(() => {});
  }, [project, projectId, selectedWeekKey]);

  const weeks = useMemo(() =>
    project ? buildWeeks(project.pm_start ?? project.start_date, project.pm_end ?? project.end_date) : [],
  [project]);

  const scWeeks = useMemo(() => weeks.map(w => format(w.monday, "yyyy-MM-dd")), [weeks]);

  const chartData = useMemo(() => {
    const pmStart = project?.pm_start ? parseISO(project.pm_start) : undefined;
    return buildChartData(scSteps, scWeeks, pmStart);
  }, [scSteps, scWeeks, project]);

  const currentWeekIdx = weeks.findIndex(w => w.weekKey === selectedWeekKey);
  const currentWeek    = weeks[currentWeekIdx];
  const isPM = project?.current_phase_code === "project_management";

  // Grouped tasks
  const PHASE_ORDER = ["Operational Brief", "Design", "Project Control", "Project Management", "Handover"];
  const grouped: Record<string, SubTask[]> = {};
  for (const t of tasks) {
    const label = (t.phase_id && phaseIdToLabel[t.phase_id]) || "General";
    (grouped[label] = grouped[label] ?? []).push(t);
  }
  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => {
    const ai = PHASE_ORDER.indexOf(a), bi = PHASE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (loading) return (
    <div className="flex justify-center items-center min-h-64">
      <div className="w-7 h-7 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
    </div>
  );

  if (!project) return (
    <div className="glass-card p-12 text-center">
      <p className="text-sm text-slate-400">Project not found.</p>
      <button onClick={() => router.back()} className="mt-4 text-xs text-brand-sienna hover:underline">← Go back</button>
    </div>
  );

  const phaseColor = PHASE_COLORS[project.current_phase_code ?? ""] ?? "#94a3b8";
  const pics       = people.filter(p => p.role_code === "pic");
  const stakeList  = people.filter(p => p.role_code === "stakeholder");
  const variance   = weekProg ? Number((weekProg.actual_pct - weekProg.plan_pct).toFixed(2)) : 0;

  const phaseInfos = [
    { start: project.brief_received, end: project.brief_deadline, progress: Number(project.brief_progress ?? 0) },
    { start: project.design_start,   end: project.design_end,     progress: Number(project.design_progress ?? 0) },
    { start: project.control_start,  end: project.control_end,    progress: Number(project.control_progress ?? 0) },
    { start: project.pm_start,       end: project.pm_end,         progress: Number(project.pm_progress ?? 0) },
    { start: project.handover_start, end: project.handover_end,   progress: Number(project.handover_progress ?? 0) },
  ];
  const currentPhaseIdx = PHASE_STEPS.findIndex(s => s.code === project.current_phase_code);

  return (
    <div className="space-y-5 pb-14 animate-page-enter max-w-4xl mx-auto">

      {/* ── Top nav ── */}
      <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
        <button
          onClick={() => router.push(`/dashboard/weekly-report?week=${selectedWeekVal}`)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-brand-sienna transition-colors"
        >
          <ArrowLeft size={15} /> Weekly Report
        </button>
        <button
          onClick={() => router.push(`/dashboard/projects/${project.id}`)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-brand-sienna transition-colors"
        >
          <ExternalLink size={12} /> Open Project
        </button>
      </div>

      {/* ── 1. Project Info ── */}
      <div className="glass-card overflow-hidden">
        <div className="h-1.5 w-full" style={{ backgroundColor: phaseColor }} />
        <div className="p-6">
          <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-white leading-tight">{project.project_name}</h1>
              <p className="text-xs font-mono text-slate-400 mt-1">{project.project_code}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {project.current_phase_name && (
                <span className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: phaseColor }}>
                  {project.current_phase_name}
                </span>
              )}
              {project.priority_name && (
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ color: project.priority_color ?? undefined, backgroundColor: `${project.priority_color}20` }}>
                  {project.priority_name}
                </span>
              )}
              {project.status_label && (
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                  style={{ color: project.status_color ?? undefined, backgroundColor: `${project.status_color}20` }}>
                  {project.status_label}
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {/* Location */}
            {(project.address || project.unit_name) && (
              <div className="flex items-start gap-2.5">
                <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5">Location</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{project.unit_name ?? ""}{project.unit_name && project.address ? " · " : ""}{project.address ?? ""}</p>
                </div>
              </div>
            )}

            {/* Timeline */}
            {(project.start_date || project.end_date) && (
              <div className="flex items-start gap-2.5">
                <CalendarRange size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5">Timeline</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{fmtFull(project.start_date)}{project.end_date ? ` – ${fmtFull(project.end_date)}` : ""}</p>
                </div>
              </div>
            )}

            {/* PIC */}
            {pics.length > 0 && (
              <div className="flex items-start gap-2.5">
                <User size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-1">PIC</p>
                  <div className="space-y-1">
                    {pics.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[8px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                          {(p.raw_person_name ?? p.full_name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm text-slate-700 dark:text-slate-200">{p.raw_person_name ?? p.full_name}</span>
                        {p.is_primary && <span className="text-[8px] font-bold px-1.5 py-px rounded-full bg-brand-sienna/15 text-brand-sienna">Primary</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Stakeholders */}
            {stakeList.length > 0 && (
              <div className="flex items-start gap-2.5">
                <Users size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Stakeholders</p>
                  <div className="flex flex-wrap gap-1.5">
                    {stakeList.map(s => (
                      <span key={s.id} className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-slate-300">
                        {s.raw_person_name ?? s.full_name}
                        {s.raw_organization_name ? ` · ${s.raw_organization_name}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            {project.summary_brief && (
              <div className="sm:col-span-2 flex items-start gap-2.5">
                <Building2 size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5">Summary</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{project.summary_brief}</p>
                </div>
              </div>
            )}
          </div>

          {/* Overall progress */}
          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/6">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
              <span className="uppercase tracking-widest font-semibold">Overall Progress</span>
              <span className="font-bold text-slate-600 dark:text-slate-300">{Number(project.overall_progress_pct ?? 0).toFixed(1)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 dark:bg-white/6 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, Number(project.overall_progress_pct ?? 0))}%`, backgroundColor: phaseColor }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Phase Progress ── */}
      <div className="glass-card p-6">
        <SectionHeader icon={TrendingUp} title="Phase Progress" />
        <div className="flex items-start overflow-x-auto pb-2">
          {PHASE_STEPS.flatMap((step, i) => {
            const isPast    = i < currentPhaseIdx;
            const isCurrent = i === currentPhaseIdx;
            const isReached = isPast || isCurrent;
            const info      = phaseInfos[i];
            const items = [
              <div key={step.code} className="flex flex-col items-center gap-1 min-w-18">
                <div
                  className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center"
                  style={{
                    backgroundColor: isReached ? step.color : "transparent",
                    borderColor: isReached ? step.color : "#cbd5e1",
                    boxShadow: isCurrent ? `0 0 14px ${step.color}70` : "none",
                  }}
                >
                  {isPast && <span className="text-white text-[7px] font-bold">✓</span>}
                </div>
                <span className="text-[9px] font-bold uppercase tracking-wide whitespace-nowrap" style={{ color: isReached ? step.color : "#94a3b8" }}>
                  {step.label}
                </span>
                {isCurrent && <span className="text-[7px] font-bold px-1.5 py-px rounded-full text-white" style={{ backgroundColor: step.color }}>NOW</span>}
                {info.progress > 0 && (
                  <span className="text-[10px] font-bold" style={{ color: step.color }}>{info.progress}%</span>
                )}
                {(info.start || info.end) && (
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 text-center leading-tight">
                    {fmtD(info.start)}{info.end && info.end !== info.start ? `–${fmtD(info.end)}` : ""}
                  </span>
                )}
              </div>,
            ];
            if (i < PHASE_STEPS.length - 1) {
              items.push(
                <div key={`line-${i}`} className="flex-1 h-px mt-2.5 mx-2 min-w-4"
                  style={{ backgroundColor: (i + 1) <= currentPhaseIdx ? PHASE_STEPS[i + 1].color : "#e2e8f0" }} />
              );
            }
            return items;
          })}
        </div>
      </div>

      {/* ── 3. Weekly Progress (PM only) ── */}
      {isPM && (
        <div className="glass-card overflow-hidden">
          {/* Week nav header */}
          <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/6">
            <Camera size={14} className="text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex-1">Weekly Progress</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { const w = weeks[currentWeekIdx - 1]; if (w) setSelectedWeekVal(toWeekVal(w.monday)); }}
                disabled={currentWeekIdx <= 0}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 hover:text-brand-sienna hover:border-brand-sienna/40 disabled:opacity-30 transition-all"
              >
                <ChevronLeft size={13} />
              </button>
              <input
                type="week"
                value={selectedWeekVal}
                onChange={e => setSelectedWeekVal(e.target.value)}
                className="rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-2 pr-2 py-1 text-[11px] outline-none text-slate-700 dark:text-white w-36 cursor-pointer focus:border-brand-sienna/60 transition-all"
              />
              <button
                onClick={() => { const w = weeks[currentWeekIdx + 1]; if (w) setSelectedWeekVal(toWeekVal(w.monday)); }}
                disabled={currentWeekIdx >= weeks.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 hover:text-brand-sienna hover:border-brand-sienna/40 disabled:opacity-30 transition-all"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* Week label + status */}
          {currentWeek && weekProg && (
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-white/6 bg-amber-50/40 dark:bg-amber-950/10">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Week {currentWeek.weekNum}</span>
              <span className="text-[11px] text-amber-600/70 dark:text-amber-500/70">{currentWeek.range}</span>
              <span className={`ml-auto text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${statusColor(weekProg.status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot(weekProg.status)}`} />
                {weekProg.status}
              </span>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 ? (
            <div className="p-5">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-3">Photos</p>
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {photos.map((photo, pi) => (
                  <div key={photo.id} className="relative aspect-square cursor-zoom-in rounded-xl overflow-hidden border border-slate-200/60 dark:border-white/8 group"
                    onClick={() => setLightbox(photo)}>
                    <img src={photo.file_url} alt={photo.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    {pi === 7 && photos.length > 8 && (
                      <div className="absolute inset-0 bg-black/55 flex items-center justify-center rounded-xl">
                        <span className="text-white text-xs font-bold">+{photos.length - 8}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-5 py-6 flex items-center gap-2 text-slate-300 dark:text-slate-700 text-sm">
              <Camera size={14} /><span>No photos for this week</span>
            </div>
          )}

          {/* Progress stats */}
          {weekProg && (
            <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-white/6 border-t border-slate-100 dark:border-white/6">
              {[
                { label: "Plan",     val: weekProg.plan_pct,   cls: "text-blue-600 dark:text-blue-400",     pre: "" },
                { label: "Actual",   val: weekProg.actual_pct, cls: weekProg.actual_pct >= weekProg.plan_pct ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400", pre: "" },
                { label: "Variance", val: variance,            cls: variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-rose-500" : "text-slate-400", pre: variance > 0 ? "+" : "" },
              ].map(item => (
                <div key={item.label} className="px-6 py-4">
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.cls}`}>
                    {item.val !== 0 ? `${item.pre}${item.val.toFixed(1)}%` : <span className="text-slate-300 dark:text-slate-600 text-lg">—</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 4. S-Curve (PM only) ── */}
      {isPM && scSteps.length > 0 && chartData.length > 0 && (
        <div className="glass-card p-6">
          <SectionHeader icon={TrendingUp} title="S-Curve" />
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="planGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} domain={[0, 100]} width={36} />
              <Tooltip
                contentStyle={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 11 }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                itemStyle={{ color: "#cbd5e1" }}
                formatter={(v: number) => `${v.toFixed(2)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Area type="monotone" dataKey="plan" name="Planned Target" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" fill="url(#planGrad)" dot={false} connectNulls />
              <Line type="monotone" dataKey="actual" name="Actual Progress" stroke="#22c55e" strokeWidth={2.5} fill="url(#actualGrad)" dot={{ r: 3, fill: "#22c55e" }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── 5. Sub-Tasks ── */}
      {tasks.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckSquare size={15} className="text-slate-400 shrink-0" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Sub-Tasks</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400">
              {tasks.filter(t => Number(t.progress_pct) >= 100).length}/{tasks.length} done
            </span>
          </div>

          <div className="space-y-5">
            {sortedGroups.map(([phase, phaseTasks]) => (
              <div key={phase}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{phase}</p>
                <div className="space-y-0.5">
                  {phaseTasks.map(t => {
                    const done = Number(t.progress_pct) >= 100;
                    return (
                      <div key={t.id} className="flex items-start gap-3 py-2.5 px-3 rounded-xl bg-slate-50/50 dark:bg-white/2 border border-slate-100/60 dark:border-white/4">
                        {done
                          ? <CheckSquare size={15} className="text-emerald-500 shrink-0 mt-0.5" />
                          : <Square size={15} className="text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                        }
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm leading-snug ${done ? "line-through text-slate-400 dark:text-slate-600" : "text-slate-700 dark:text-slate-200"}`}>
                            {t.title}
                          </p>
                          {(t.raw_assignee_name || t.raw_assigned_by_name) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                              {t.raw_assignee_name && (
                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <User size={9} /> {t.raw_assignee_name}
                                </span>
                              )}
                              {t.raw_assigned_by_name && (
                                <span className="text-[10px] text-slate-300 dark:text-slate-600">
                                  assigned by {t.raw_assigned_by_name}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {done && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 shrink-0">Done</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-9999 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
          onMouseDown={e => { if (e.target === e.currentTarget) setLightbox(null); }}>
          <button onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors z-10">
            ✕
          </button>
          <div className="relative max-w-5xl w-full overflow-hidden rounded-xl" onClick={e => e.stopPropagation()}>
            <img src={lightbox.file_url} alt={lightbox.file_name} className="w-full max-h-[90vh] object-contain rounded-xl block" />
            {lightbox.uploaded_by_name && (
              <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-linear-to-t from-black/60 to-transparent rounded-b-2xl">
                <p className="text-white text-xs">Uploaded by {lightbox.uploaded_by_name}</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
