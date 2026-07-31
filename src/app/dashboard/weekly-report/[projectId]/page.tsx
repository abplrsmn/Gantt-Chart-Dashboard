"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import {
  format, addDays, parseISO, isValid, getISOWeek, getISOWeekYear,
  startOfISOWeek, eachWeekOfInterval,
} from "date-fns";
import {
  ArrowLeft, Camera, CalendarRange, ChevronLeft, ChevronRight,
  MapPin, User, Users, Building2, TrendingUp, CheckSquare, Square, ExternalLink, FileText, Download,
} from "lucide-react";
import { PHASE_LIST, PHASE_COLORS, DEFAULT_PHASE_COLOR } from "@/lib/phases";
import WeekPicker from "@/components/dashboard/WeekPicker";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
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
  phase_id: string | null;
};

type Project = {
  id: string;
  project_code: string;
  project_name: string;
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
type Document = {
  id: string; file_name: string; file_url: string | null; mime_type: string | null;
  file_size_bytes: string | null; uploaded_by_name: string | null; phase_id: string | null;
};

type STask = { id: string; name: string; bobot: number; weeklyPlan: Record<string, number> };
type SStep = { id: string; letter: string; name: string; step_order: number; tasks: STask[] };
type ChartPoint = {
  label: string; plan: number; actual: number | null;
  actualAhead: number | null; actualBehind: number | null;
};

// ── Constants ────────────────────────────────────────────────────────────────

const PHASE_STEPS = PHASE_LIST.map(p => ({ code: p.code, label: p.shortLabel, color: p.color }));

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
function isImageFile(f: { mime_type: string | null; file_name: string }) {
  return (f.mime_type ?? "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(f.file_name);
}
function isPdfFile(f: { mime_type: string | null; file_name: string }) {
  return f.mime_type === "application/pdf" || /\.pdf$/i.test(f.file_name);
}
function fmtBytes(v: string | null): string {
  if (!v) return "";
  const n = Number(v);
  if (isNaN(n) || n === 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

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
      weeklyPlan: Object.fromEntries(t.weeks.map(w => [w.week_date, w.plan_pct])),
    })),
  }));
}

// Same as SCurveCharts.tsx: use per-week plan data from DB if available
// (edited in the grid), else fall back to spreading bobot evenly.
function calcWeeklyPlan(steps: SStep[], weeks: string[]): Record<string, number> {
  const n = weeks.length; if (!n) return {};
  const res: Record<string, number> = {};
  for (const w of weeks) res[w] = 0;
  for (const s of steps) for (const t of s.tasks) {
    const hasPerWeekPlan = Object.keys(t.weeklyPlan).length > 0;
    if (hasPerWeekPlan) {
      for (const w of weeks) res[w] += t.weeklyPlan[w] ?? 0;
    } else {
      const pw = t.bobot / n;
      for (const w of weeks) res[w] += pw;
    }
  }
  return res;
}

// Cumulative-actual series (realisasi kumulatif) per week — carries the last
// entered value forward, null after the last reported week. Mirrors
// SCurveCharts.tsx's cumActualSeries so both pages read the same source.
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

function buildChartData(steps: SStep[], weeks: string[], cumActuals: Record<string, number>, rangeStart?: Date, rangeEnd?: Date): ChartPoint[] {
  if (!weeks.length) return [];
  const weeklyPlan = calcWeeklyPlan(steps, weeks);
  const actualCum = cumActualSeries(weeks, cumActuals);
  const hasAnyActual = actualCum.some(v => v != null);
  let cumPlan = 0;
  const points: ChartPoint[] = [{ label: rangeStart ? format(rangeStart, "d MMM") : "", plan: 0, actual: hasAnyActual ? 0 : null, actualAhead: null, actualBehind: null }];
  for (let i = 0; i < weeks.length; i++) {
    const w = weeks[i];
    cumPlan = cumPlan + (weeklyPlan[w] ?? 0);
    const a = actualCum[i];
    const weekEnd = addDays(parseISO(w), 6);
    const labelDate = rangeEnd && rangeEnd < weekEnd ? rangeEnd : weekEnd;
    points.push({
      label: format(labelDate, "d MMM"),
      plan: Number(cumPlan.toFixed(2)),
      actual: a == null ? null : Number(a.toFixed(2)),
      actualAhead: null, actualBehind: null,
    });
  }

  // Split actual into ahead/behind-of-plan series, duplicating the crossing
  // point into both so the colored segments touch instead of gapping.
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
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" /></div>}>
      <ProjectReportContent />
    </Suspense>
  );
}

function ProjectReportContent() {
  const router       = useRouter();
  const params       = useParams();
  const searchParams = useSearchParams();
  const projectId    = params.projectId as string;

  // Placeholder until the project's weeks load; the effect below always snaps
  // this to Week 1 on entry (even if the incoming URL carries a ?week= from
  // the list page's own "today" filter — that's a different, unrelated
  // context and shouldn't be treated as the user asking for that week here).
  // Once the user moves the picker themselves, further loads are respected.
  const initialWeek = searchParams.get("week") ?? toWeekVal(nowWIB());
  const [selectedWeekVal, setSelectedWeekVal] = useState(initialWeek);
  const hasLockedWeek1 = useRef(false);
  const userMovedWeek  = useRef(false);

  const [project,  setProject]  = useState<Project | null>(null);
  const [people,   setPeople]   = useState<Person[]>([]);
  const [tasks,    setTasks]    = useState<SubTask[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [photos,   setPhotos]   = useState<Photo[]>([]);
  const [weekProg, setWeekProg] = useState<WeekProgress | null>(null);
  const [scSteps,  setScSteps]  = useState<SStep[]>([]);
  const [cumActuals, setCumActuals] = useState<Record<string, number>>({});
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
        setDocuments(detailRes.data.attachments ?? []);
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

  // Fetch S-curve — same two endpoints Project Details reads, so the chart
  // here matches exactly: plan schedule + cumulative actual. Phase-independent.
  useEffect(() => {
    if (!project) return;
    fetch(`/api/projects/${projectId}/scurve-steps`, { cache: "no-store" })
      .then(r => r.json()).then(j => { if (j.success) setScSteps(parseApiSteps(j.data)); }).catch(() => {});
    fetch(`/api/projects/${projectId}/scurve-week-actuals`, { cache: "no-store" })
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setCumActuals(Object.fromEntries(
            (j.data as { week_date: string; cum_actual_pct: number }[]).map(r => [r.week_date, r.cum_actual_pct])
          ));
        }
      }).catch(() => {});
  }, [project, projectId]);

  // Fetch week photos + progress when week or project changes
  useEffect(() => {
    if (!project) return;
    Promise.all([
      fetch(`/api/projects/${projectId}/attachments?week_key=${selectedWeekKey}`).then(r => r.json()),
      fetch(`/api/projects/${projectId}/week-progress`).then(r => r.json()),
    ]).then(([attachRes, progRes]) => {
      if (attachRes.success) {
        setPhotos(attachRes.data as Photo[]);
      }
      const row = progRes.success ? progRes.data.find((d: { week_key: string }) => d.week_key === selectedWeekKey) : null;
      setWeekProg(row
        ? { plan_pct: Number(row.plan_pct), actual_pct: Number(row.actual_pct), status: row.status ?? "Not started" }
        : { plan_pct: 0, actual_pct: 0, status: "Not started" });
    }).catch(() => {});
  }, [project, projectId, selectedWeekKey]);

  // Weeks span the project's own date range, not the PM phase — the S-curve and
  // the weekly picker are phase-independent.
  const weeks = useMemo(() =>
    project ? buildWeeks(project.start_date, project.end_date) : [],
  [project]);

  // Once the project's weeks are known, lock the view to Week 1 — unless the
  // URL named a specific week, or the user has already moved the picker.
  useEffect(() => {
    if (hasLockedWeek1.current || userMovedWeek.current) return;
    if (weeks.length === 0) return;
    hasLockedWeek1.current = true;
    setSelectedWeekVal(toWeekVal(weeks[0].monday));
  }, [weeks]);

  const scWeeks = useMemo(() => weeks.map(w => format(w.monday, "yyyy-MM-dd")), [weeks]);

  const chartData = useMemo(() => {
    const rangeStart = project?.start_date ? parseISO(project.start_date) : undefined;
    const rangeEnd   = project?.end_date   ? parseISO(project.end_date)   : undefined;
    return buildChartData(
      scSteps, scWeeks, cumActuals,
      rangeStart && isValid(rangeStart) ? rangeStart : undefined,
      rangeEnd && isValid(rangeEnd) ? rangeEnd : undefined,
    );
  }, [scSteps, scWeeks, cumActuals, project]);

  const currentWeekIdx = weeks.findIndex(w => w.weekKey === selectedWeekKey);
  const currentWeek    = weeks[currentWeekIdx];

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

  // Grouped documents — Brief/Design/Control/Handover uploads only. PM's
  // files are week-tagged photo/file uploads (phase_id null, source_message_id
  // like "week-2026-04-27") that already surface under Weekly Progress above,
  // so they're deliberately excluded here instead of dumping into a "General"
  // bucket.
  const groupedDocs: Record<string, Document[]> = {};
  for (const d of documents) {
    const label = d.phase_id ? phaseIdToLabel[d.phase_id] : undefined;
    if (!label || label === "Project Management") continue;
    (groupedDocs[label] = groupedDocs[label] ?? []).push(d);
  }
  const sortedDocGroups = Object.entries(groupedDocs).sort(([a], [b]) => {
    const ai = PHASE_ORDER.indexOf(a), bi = PHASE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  const visibleDocsCount = sortedDocGroups.reduce((sum, [, docs]) => sum + docs.length, 0);

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

  const phaseColor = PHASE_COLORS[project.current_phase_code ?? ""] ?? DEFAULT_PHASE_COLOR;
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
  // Phase ids run 1 (brief) → 5 (handover) in PHASE_LIST order, matching
  // Project Details' phaseId mapping — same source, filtered the same way.
  const phasePicsByIndex = PHASE_STEPS.map((_, i) => people.filter(p => p.role_code === "pic" && Number(p.phase_id) === i + 1));

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
          onClick={() => router.push(`/dashboard/projects/${project.id}?from=weekly`)}
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
              <div className="flex items-start gap-2.5 sm:justify-end sm:text-right">
                <CalendarRange size={13} className="text-slate-400 mt-0.5 shrink-0 sm:order-last" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5">Timeline</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{fmtFull(project.start_date)}{project.end_date ? ` – ${fmtFull(project.end_date)}` : ""}</p>
                </div>
              </div>
            )}

            {/* Summary — pinned to the left column so it sits level with
                Stakeholders on the right, regardless of what else is present
                in the grid (Location may be absent). */}
            {project.summary_brief && (
              <div className="flex items-start gap-2.5 sm:col-start-1">
                <Building2 size={13} className="text-slate-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-0.5">Summary</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{project.summary_brief}</p>
                </div>
              </div>
            )}

            {/* Stakeholders — pinned to the right column regardless of what
                else is present in the grid (PIC used to occupy the left cell
                on this row; now Stakeholders must not fall into it instead). */}
            {stakeList.length > 0 && (
              <div className="flex items-start gap-2.5 sm:col-start-2 sm:justify-end sm:text-right">
                <Users size={13} className="text-slate-400 mt-0.5 shrink-0 sm:order-last" />
                <div>
                  <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-1">Stakeholders</p>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
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

        {/* PIC per phase — separate, legible list (the mini timeline nodes
            above are too narrow to show full names clearly). */}
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-white/6">
          <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-2.5">PIC per Phase</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-2.5">
            {PHASE_STEPS.map((step, i) => {
              const phasePics = phasePicsByIndex[i];
              return (
                <div key={step.code} className="flex items-start gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0 mt-1" style={{ backgroundColor: step.color }} />
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{step.label}</p>
                    {phasePics.length > 0 ? (
                      <div className="space-y-1 mt-1">
                        {phasePics.map(p => (
                          <div key={p.id} className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[8px] font-bold text-slate-500 dark:text-slate-400 shrink-0">
                              {(p.raw_person_name ?? p.full_name ?? "?").charAt(0).toUpperCase()}
                            </div>
                            <span className="text-[12px] text-slate-700 dark:text-slate-200 truncate">{p.raw_person_name ?? p.full_name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-300 dark:text-slate-600 italic mt-1">Not assigned</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 3. Weekly Progress ── */}
      <div className="glass-card overflow-hidden">
        {/* Week nav header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 dark:border-white/6">
          <div className="w-1 h-4 rounded-full shrink-0" style={{ background: "var(--brand-espresso)" }} />
          <span className="text-base font-bold text-slate-700 dark:text-slate-200 flex-1">Weekly Progress</span>
          <div className="flex items-center gap-1.5">
            <button
              aria-label="Previous week"
              onClick={() => { const w = weeks[currentWeekIdx - 1]; if (w) { userMovedWeek.current = true; setSelectedWeekVal(toWeekVal(w.monday)); } }}
              disabled={currentWeekIdx <= 0}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 hover:text-brand-sienna hover:border-brand-sienna/40 disabled:opacity-30 transition-all"
            >
              <ChevronLeft size={13} />
            </button>
            <WeekPicker value={selectedWeekVal} onChange={v => { userMovedWeek.current = true; setSelectedWeekVal(v); }} />
            <button
              aria-label="Next week"
              onClick={() => { const w = weeks[currentWeekIdx + 1]; if (w) { userMovedWeek.current = true; setSelectedWeekVal(toWeekVal(w.monday)); } }}
              disabled={currentWeekIdx >= weeks.length - 1}
              className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 hover:text-brand-sienna hover:border-brand-sienna/40 disabled:opacity-30 transition-all"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* Week label */}
        {currentWeek && weekProg && (
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 dark:border-white/6 bg-amber-50/40 dark:bg-amber-950/10">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">Week {currentWeek.weekNum}</span>
            <span className="text-[11px] text-amber-600/70 dark:text-amber-500/70">{currentWeek.range}</span>
          </div>
        )}

        {/* Photos & Files */}
        {photos.length > 0 ? (
          <div className="p-5">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 font-semibold mb-3">Photos &amp; Files</p>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {photos.map((photo, pi) => (
                <div key={photo.id} className="relative aspect-square cursor-zoom-in rounded-xl overflow-hidden border border-slate-200/60 dark:border-white/8 group bg-slate-50 dark:bg-white/4 flex items-center justify-center"
                  onClick={() => setLightbox(photo)}>
                  {isImageFile(photo) ? (
                    <img src={photo.file_url} alt={photo.file_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="flex flex-col items-center gap-1 px-1.5 text-center">
                      <FileText size={20} className={isPdfFile(photo) ? "text-red-500" : "text-slate-400 dark:text-slate-500"} />
                      <span className="text-[8px] font-semibold text-slate-400 dark:text-slate-500 truncate w-full leading-tight">
                        {photo.file_name.split(".").pop()?.toUpperCase()}
                      </span>
                    </div>
                  )}
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

      {/* ── 4. S-Curve — same data + look as Project Details ── */}
      {scSteps.length > 0 && chartData.length > 0 && (
        <div className="glass-card p-6">
          <SectionHeader icon={TrendingUp} title="S-Curve" />
          <div className="relative" style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 800, height: 320 }}>
              <LineChart data={chartData} margin={{ top: 12, right: 24, bottom: 48, left: 4 }}>
                <CartesianGrid horizontal vertical={false} strokeDasharray="4 4" stroke="rgba(148,163,184,0.35)" />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "currentColor" }} tickLine={false} axisLine={false} interval="preserveStartEnd" padding={{ left: 24, right: 8 }} tickMargin={8} />
                <YAxis domain={[0, 100]} ticks={[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]} interval={0} tick={{ fontSize: 9, fill: "currentColor" }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={34} />
                <Tooltip
                  contentStyle={{ background: "rgba(15,23,42,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, fontSize: 11 }}
                  labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                  itemStyle={{ color: "#cbd5e1" }}
                  formatter={(v: number) => `${(v as number).toFixed(2)}%`}
                />
                <Line type="linear" dataKey="plan" name="Planned Target" stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls isAnimationActive animationDuration={650} animationEasing="ease-in-out" />
                <Line type="linear" dataKey="actualAhead" name="Actual Progress" stroke="#22c55e" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive animationDuration={650} animationEasing="ease-in-out" />
                <Line type="linear" dataKey="actualBehind" name="Actual Progress" stroke="#ef4444" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive animationDuration={650} animationEasing="ease-in-out" />
              </LineChart>
            </ResponsiveContainer>
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

      {/* ── 6. Documents — every phase's uploads except PM (its files are
          week-tagged and already shown under Weekly Progress above) ── */}
      {visibleDocsCount > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={15} className="text-slate-400 shrink-0" />
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Documents</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-500 dark:text-slate-400">
              {visibleDocsCount}
            </span>
          </div>

          <div className="space-y-5">
            {sortedDocGroups.map(([phase, phaseDocs]) => (
              <div key={phase}>
                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">{phase}</p>
                <div className="space-y-0.5">
                  {phaseDocs.map(d => (
                    <a
                      key={d.id}
                      href={d.file_url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 group rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/4 transition-colors"
                    >
                      <FileText size={13} className={isPdfFile(d) ? "text-red-500 shrink-0" : "text-slate-400 shrink-0"} />
                      <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 group-hover:underline transition-colors">
                        {d.file_name}
                      </span>
                      {d.file_size_bytes && (
                        <span className="text-[10px] text-slate-400 shrink-0">{fmtBytes(d.file_size_bytes)}</span>
                      )}
                    </a>
                  ))}
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
          {isImageFile(lightbox) ? (
            <div className="relative max-w-5xl w-full overflow-hidden rounded-xl" onClick={e => e.stopPropagation()}>
              <img src={lightbox.file_url} alt={lightbox.file_name} className="w-full max-h-[90vh] object-contain rounded-xl block" />
              {lightbox.uploaded_by_name && (
                <div className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-linear-to-t from-black/60 to-transparent rounded-b-2xl">
                  <p className="text-white text-xs">Uploaded by {lightbox.uploaded_by_name}</p>
                </div>
              )}
            </div>
          ) : isPdfFile(lightbox) ? (
            <div className="relative w-full max-w-4xl h-[88vh] bg-white dark:bg-zinc-900 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200/60 dark:border-white/8">
                <FileText size={14} className="text-red-500 shrink-0" />
                <p className="text-xs font-bold text-slate-700 dark:text-white flex-1 truncate">{lightbox.file_name}</p>
                {lightbox.uploaded_by_name && <p className="text-[10px] text-slate-400 shrink-0">by {lightbox.uploaded_by_name}</p>}
              </div>
              <iframe src={lightbox.file_url} className="w-full h-[calc(100%-48px)] border-0" title={lightbox.file_name} />
            </div>
          ) : (
            <div className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-6 flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-white/6 flex items-center justify-center">
                  <FileText size={32} className="text-slate-400" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-all">{lightbox.file_name}</p>
                  {lightbox.uploaded_by_name && <p className="text-[10px] text-slate-400 mt-1">Uploaded by {lightbox.uploaded_by_name}</p>}
                </div>
                <a href={lightbox.file_url} download={lightbox.file_name}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-semibold transition-colors"
                  style={{ backgroundColor: "var(--brand-sienna)" }}>
                  <Download size={12} /> Download
                </a>
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
