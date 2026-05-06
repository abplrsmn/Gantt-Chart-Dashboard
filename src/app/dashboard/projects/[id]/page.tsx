"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronDown,
  User, Building2, ClipboardList, AlertTriangle, Zap,
  Calendar, DollarSign, Activity, Clock, FileText,
} from "lucide-react";
import SCurveCharts from "@/components/dashboard/SCurveCharts";

// ─── Types ────────────────────────────────────────────────────────────────────
type ProjectDetail = {
  id: string;
  project_code: string;
  project_name: string;
  overall_progress_pct: string | null;
  start_date: string | null;
  end_date: string | null;
  budget_capex: string | null;
  contract_amount: string | null;
  summary_brief: string | null;
  blocker_note: string | null;
  next_action_note: string | null;
  current_phase_name: string | null;
  current_phase_code: string | null;
  status_label: string | null;
  status_color: string | null;
  priority_name: string | null;
  priority_code: string | null;
  priority_color: string | null;
  unit_code: string | null;
  unit_name: string | null;
  category_name: string | null;
  brief_deadline: string | null;
  brief_received: string | null;
  brief_progress: string | null;
  brief_notes: string | null;
  design_start: string | null;
  design_end: string | null;
  design_progress: string | null;
  working_drawing_status: string | null;
  design_notes: string | null;
  control_start: string | null;
  control_end: string | null;
  control_progress: string | null;
  phase_contract_amount: string | null;
  control_notes: string | null;
  pm_start: string | null;
  pm_end: string | null;
  pm_progress: string | null;
  deviation_days: string | null;
  current_site_progress: string | null;
  pm_notes: string | null;
  handover_start: string | null;
  handover_end: string | null;
  handover_progress: string | null;
  actual_phase_completion_date: string | null;
  handover_notes: string | null;
};

type PersonRow = {
  id: string;
  raw_person_name: string | null;
  raw_organization_name: string | null;
  is_primary: boolean;
  notes: string | null;
  phase_id: number | null;
  role_code: string | null;
  role_name: string | null;
  full_name: string | null;
  job_title: string | null;
  department: string | null;
  email: string | null;
};

type LogRow = {
  id: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  change_summary: string | null;
  changed_by_name: string | null;
  action_type: string | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : format(d, "dd MMM yyyy");
}

function fmtCurrency(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}M`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444", HIGH: "#f97316", MID: "#eab308", LOW: "#22c55e",
};

const PHASE_DEFS = [
  { key: "brief",    label: "Operational Brief",  color: "#64748b", weight: 10,
    startKey: "brief_received"  as const, endKey: "brief_deadline"  as const,
    progressKey: "brief_progress"   as const, notesKey: "brief_notes"   as const,
    extras: [] as { label: string; key: keyof ProjectDetail }[] },
  { key: "design",   label: "Design",             color: "#3b82f6", weight: 20,
    startKey: "design_start"    as const, endKey: "design_end"      as const,
    progressKey: "design_progress"  as const, notesKey: "design_notes"  as const,
    extras: [{ label: "Working Drawing", key: "working_drawing_status" as keyof ProjectDetail }] },
  { key: "control",  label: "Project Control",    color: "#f59e0b", weight: 15,
    startKey: "control_start"   as const, endKey: "control_end"     as const,
    progressKey: "control_progress" as const, notesKey: "control_notes" as const,
    extras: [{ label: "Contract Amount", key: "phase_contract_amount" as keyof ProjectDetail }] },
  { key: "pm",       label: "Project Management", color: "#14b8a6", weight: 45,
    startKey: "pm_start"        as const, endKey: "pm_end"          as const,
    progressKey: "pm_progress"      as const, notesKey: "pm_notes"      as const,
    extras: [
      { label: "Deviation Days", key: "deviation_days" as keyof ProjectDetail },
      { label: "Site Progress",  key: "current_site_progress" as keyof ProjectDetail },
    ] },
  { key: "handover", label: "Handover",           color: "#22c55e", weight: 10,
    startKey: "handover_start"  as const, endKey: "handover_end"    as const,
    progressKey: "handover_progress" as const, notesKey: "handover_notes" as const,
    extras: [{ label: "Completion Date", key: "actual_phase_completion_date" as keyof ProjectDetail }] },
] as const;

const ROLE_ORDER = ["pic", "assignee", "stakeholder", "approver", "requester", "vendor"];
const ROLE_ICONS: Record<string, React.ElementType> = {
  pic: User, assignee: User, stakeholder: Building2,
  approver: ClipboardList, requester: FileText, vendor: Building2,
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
        <Icon size={13} className="text-cyan-500 shrink-0" />
        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function PhaseCard({ ph, project, defaultOpen }: {
  ph: typeof PHASE_DEFS[number];
  project: ProjectDetail;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const progress = Number(project[ph.progressKey] ?? 0);
  const notes = project[ph.notesKey] as string | null;

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ borderColor: ph.color + "30" }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-white/5"
        style={{ backgroundColor: ph.color + "10" }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ph.color }} />
        <span className="flex-1 text-xs font-bold uppercase tracking-wider" style={{ color: ph.color }}>
          {ph.label}
        </span>
        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mr-2">
          {ph.weight}% weight
        </span>
        {/* Mini progress */}
        <div className="w-16 h-1.5 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden mr-2">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, progress)}%`, backgroundColor: ph.color }} />
        </div>
        <span className="text-[10px] font-bold mr-2" style={{ color: ph.color }}>{progress}%</span>
        <ChevronDown
          size={12}
          className="text-slate-400 transition-transform duration-200 shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Body */}
      {open && (
        <div className="px-4 py-3 space-y-3 bg-white/40 dark:bg-zinc-900/30">
          {/* Dates row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">Start</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{fmtDate(project[ph.startKey])}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">End</p>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{fmtDate(project[ph.endKey])}</p>
            </div>
          </div>

          {/* Extras */}
          {ph.extras.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {ph.extras.map(ex => {
                const raw = project[ex.key];
                const val = ex.key === "phase_contract_amount"
                  ? fmtCurrency(raw as string | null)
                  : ex.key === "actual_phase_completion_date"
                  ? fmtDate(raw as string | null)
                  : (raw as string | null) ?? "—";
                return (
                  <div key={ex.key}>
                    <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">{ex.label}</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{val}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          {notes && (
            <div className="rounded-lg bg-slate-100/60 dark:bg-white/5 px-3 py-2">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Notes</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const startParam = params.get("start") ?? "";
  const endParam   = params.get("end")   ?? "";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [people, setPeople]   = useState<PersonRow[]>([]);
  const [logs, setLogs]       = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        if (json.success) {
          setProject(json.data.project);
          setPeople(json.data.people);
          setLogs(json.data.logs);
        } else {
          setError(json.error ?? "Unknown error");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const peopleByRole = useMemo(() => {
    const map = new Map<string, PersonRow[]>();
    for (const p of people) {
      const role = p.role_code ?? "other";
      if (!map.has(role)) map.set(role, []);
      map.get(role)!.push(p);
    }
    return map;
  }, [people]);

  const orderedRoles = useMemo(() => {
    const roles = Array.from(peopleByRole.keys());
    return [
      ...ROLE_ORDER.filter(r => roles.includes(r)),
      ...roles.filter(r => !ROLE_ORDER.includes(r)),
    ];
  }, [peopleByRole]);

  // Build project in SCurveCharts-compatible shape
  const scProject = useMemo(() => {
    if (!project) return null;
    return {
      id: project.id,
      project_name: project.project_name,
      start_date: project.start_date,
      end_date: project.end_date,
      brief_received: project.brief_received,
      brief_deadline: project.brief_deadline,
      brief_progress: Number(project.brief_progress ?? 0),
      design_start: project.design_start,
      design_end: project.design_end,
      design_progress: Number(project.design_progress ?? 0),
      control_start: project.control_start,
      control_end: project.control_end,
      control_progress: Number(project.control_progress ?? 0),
      pm_start: project.pm_start,
      pm_end: project.pm_end,
      pm_progress: Number(project.pm_progress ?? 0),
      handover_start: project.handover_start,
      handover_end: project.handover_end,
      handover_progress: Number(project.handover_progress ?? 0),
      unit_name: project.unit_name,
      unit_code: project.unit_code,
      overall_progress_pct: project.overall_progress_pct,
    };
  }, [project]);

  const backHref = startParam && endParam
    ? `/dashboard/projects/list?start=${startParam}&end=${endParam}`
    : "/dashboard/projects/list";

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="glass-card p-16 text-center space-y-3">
        <p className="text-sm font-semibold text-red-400">{error ?? "Project not found"}</p>
        <button onClick={() => router.push(backHref)} className="text-xs text-cyan-500 underline">
          Back to Projects
        </button>
      </div>
    );
  }

  const progress   = Number(project.overall_progress_pct ?? 0);
  const pColor     = project.priority_color ?? PRIORITY_COLORS[project.priority_code ?? ""] ?? "#94a3b8";
  const statusColor = project.status_color ?? "#94a3b8";

  return (
    <div className="space-y-4 pb-10 animate-page-enter">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => router.push(backHref)}
          className="p-2 mt-0.5 rounded-xl bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm shrink-0"
        >
          <ArrowLeft size={16} className="text-slate-600 dark:text-gray-300" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {project.unit_code && (
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-white/8 px-1.5 py-0.5 rounded">
                {project.unit_code}
              </span>
            )}
            {project.priority_name && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${pColor}18`, color: pColor }}>
                {project.priority_name}
              </span>
            )}
            {project.status_label && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${statusColor}18`, color: statusColor }}>
                {project.status_label}
              </span>
            )}
            {project.current_phase_name && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                {project.current_phase_name}
              </span>
            )}
          </div>
          <h2 className="text-base font-bold text-slate-800 dark:text-white leading-snug">
            {project.project_name}
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">{project.project_code}</p>
        </div>
        {/* Overall progress */}
        <div className="shrink-0 text-right">
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{progress}%</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Overall</p>
        </div>
      </div>

      {/* ── Key info strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Calendar, label: "Start Date",  value: fmtDate(project.start_date) },
          { icon: Calendar, label: "End Date",    value: fmtDate(project.end_date) },
          { icon: DollarSign, label: "Budget",    value: fmtCurrency(project.budget_capex) },
          { icon: DollarSign, label: "Contract",  value: fmtCurrency(project.contract_amount) },
        ].map(s => (
          <div key={s.label} className="glass-card p-3.5">
            <div className="flex items-center gap-1.5 mb-1">
              <s.icon size={11} className="text-slate-400 shrink-0" />
              <p className="text-[9px] uppercase tracking-widest text-slate-400">{s.label}</p>
            </div>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Summary / Blockers / Next Action ───────────────────────────── */}
      {(project.summary_brief || project.blocker_note || project.next_action_note) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {project.summary_brief && (
            <div className="glass-card p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <FileText size={11} className="text-cyan-500" />
                <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400">Summary</p>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{project.summary_brief}</p>
            </div>
          )}
          {project.blocker_note && (
            <div className="glass-card p-4 border-red-500/20 dark:border-red-500/20">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={11} className="text-red-400" />
                <p className="text-[9px] uppercase tracking-widest font-bold text-red-400">Blocker</p>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{project.blocker_note}</p>
            </div>
          )}
          {project.next_action_note && (
            <div className="glass-card p-4 border-cyan-500/20 dark:border-cyan-500/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap size={11} className="text-cyan-400" />
                <p className="text-[9px] uppercase tracking-widest font-bold text-cyan-400">Next Action</p>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">{project.next_action_note}</p>
            </div>
          )}
        </div>
      )}

      {/* ── People ─────────────────────────────────────────────────────── */}
      {people.length > 0 && (
        <SectionCard title="Team & Stakeholders" icon={User}>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {orderedRoles.map(role => {
              const members = peopleByRole.get(role) ?? [];
              const RoleIcon = ROLE_ICONS[role] ?? User;
              return (
                <div key={role}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <RoleIcon size={11} className="text-slate-400 shrink-0" />
                    <p className="text-[9px] uppercase tracking-widest font-bold text-slate-400">
                      {members[0]?.role_name ?? role}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {members.map(m => {
                      const name = m.full_name ?? m.raw_person_name ?? "—";
                      const org  = m.raw_organization_name;
                      const title = m.job_title ?? m.department;
                      return (
                        <div key={m.id} className="flex items-start gap-2.5 rounded-lg bg-slate-50/60 dark:bg-white/4 px-3 py-2">
                          <div className="w-6 h-6 rounded-full bg-cyan-500/15 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400">
                              {name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 truncate">
                              {name}
                              {m.is_primary && (
                                <span className="ml-1 text-[8px] font-bold text-cyan-500 uppercase">Primary</span>
                              )}
                            </p>
                            {(title || org) && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {[title, org].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          {m.email && (
                            <a href={`mailto:${m.email}`}
                              className="text-[9px] text-cyan-500 hover:underline shrink-0 mt-0.5"
                              onClick={e => e.stopPropagation()}>
                              Email
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Phase Parameters ───────────────────────────────────────────── */}
      <SectionCard title="Phase Parameters" icon={Activity}>
        <div className="p-4 space-y-2">
          {PHASE_DEFS.map((ph, i) => (
            <PhaseCard
              key={ph.key}
              ph={ph}
              project={project}
              defaultOpen={project.current_phase_code === ph.key || i === 0}
            />
          ))}
        </div>
      </SectionCard>

      {/* ── Audit Log ──────────────────────────────────────────────────── */}
      <SectionCard title="Audit Log" icon={Clock}>
        {logs.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <Clock size={24} className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400">No audit entries yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/40 dark:divide-white/5">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-white/2 transition-colors">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-700 dark:text-slate-200">
                    {log.change_summary ?? (
                      <>
                        <span className="font-semibold">{log.field_name ?? "Field"}</span>
                        {log.old_value && <> changed from <span className="text-red-400">{log.old_value}</span></>}
                        {log.new_value && <> to <span className="text-cyan-500">{log.new_value}</span></>}
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {log.changed_by_name && (
                      <span className="text-[10px] text-slate-400">{log.changed_by_name}</span>
                    )}
                    {log.action_type && (
                      <span className="text-[9px] font-bold uppercase text-slate-500 bg-slate-100 dark:bg-white/8 px-1 py-0.5 rounded">
                        {log.action_type}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[9px] text-slate-400 shrink-0 mt-0.5">
                  {format(new Date(log.created_at), "dd MMM yyyy HH:mm")}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── S-Curve ────────────────────────────────────────────────────── */}
      {scProject && (
        <SCurveCharts projects={[scProject]} hidePhaseDetails />
      )}

    </div>
  );
}
