"use client";

import { useEffect, useMemo, useState, Fragment } from "react";
import { useRouter, useParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronRight,
  User, Users, Building2,
  Activity, Clock, FileText, Paperclip
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

type AttachmentRow = {
  id: string;
  file_name: string;
  file_type: string | null;
  mime_type: string | null;
  file_url: string | null;
  file_size_bytes: string | null;
  source_channel: string | null;
  source_message_id: string | null;
  uploaded_by_name: string | null;
  created_at: string;
  phase_name: string | null;
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


type FieldDef = {
  label: string;
  key: keyof ProjectDetail;
  format: "date" | "currency" | "text";
  fullWidth?: boolean;
};

type PhaseDef = {
  key: string;
  phaseId: number;
  phaseCode: string;
  label: string;
  color: string;
  weight: number;
  progressKey: keyof ProjectDetail;
  startKey: keyof ProjectDetail;
  endKey: keyof ProjectDetail;
  fields: FieldDef[];
};

const PHASE_DEFS: PhaseDef[] = [
  {
    key: "brief", phaseId: 1, phaseCode: "operational_brief",
    label: "Operational Brief", color: "#64748b", weight: 10,
    progressKey: "brief_progress",
    startKey: "brief_received", endKey: "brief_deadline",
    fields: [
      { label: "Brief Received",  key: "brief_received", format: "date" },
      { label: "Brief Deadline",  key: "brief_deadline", format: "date" },
      { label: "Notes",           key: "brief_notes",    format: "text", fullWidth: true },
    ],
  },
  {
    key: "design", phaseId: 2, phaseCode: "design",
    label: "Design", color: "#3b82f6", weight: 20,
    progressKey: "design_progress",
    startKey: "design_start", endKey: "design_end",
    fields: [
      { label: "Start Design",    key: "design_start",           format: "date" },
      { label: "Design Approval", key: "design_end",             format: "date" },
      { label: "Working Drawing", key: "working_drawing_status", format: "text", fullWidth: true },
      { label: "Notes",           key: "design_notes",           format: "text", fullWidth: true },
    ],
  },
  {
    key: "control", phaseId: 3, phaseCode: "project_control",
    label: "Project Control", color: "#f59e0b", weight: 15,
    progressKey: "control_progress",
    startKey: "control_start", endKey: "control_end",
    fields: [
      { label: "Tender Start",     key: "control_start",         format: "date" },
      { label: "SPK Released",     key: "control_end",           format: "date" },
      { label: "Contract Amount",  key: "phase_contract_amount", format: "currency", fullWidth: true },
      { label: "Notes",            key: "control_notes",         format: "text",     fullWidth: true },
    ],
  },
  {
    key: "pm", phaseId: 4, phaseCode: "project_management",
    label: "Project Management", color: "#14b8a6", weight: 45,
    progressKey: "pm_progress",
    startKey: "pm_start", endKey: "pm_end",
    fields: [
      { label: "Commence Date", key: "pm_start",              format: "date" },
      { label: "End Contract",  key: "pm_end",                format: "date" },
      { label: "Deviation Days",key: "deviation_days",        format: "text" },
      { label: "Site Progress", key: "current_site_progress", format: "text" },
      { label: "Notes",         key: "pm_notes",              format: "text", fullWidth: true },
    ],
  },
  {
    key: "handover", phaseId: 5, phaseCode: "handover",
    label: "Handover", color: "#22c55e", weight: 10,
    progressKey: "handover_progress",
    startKey: "handover_start", endKey: "handover_end",
    fields: [
      { label: "BAST 1",          key: "handover_start",               format: "date" },
      { label: "BAST 2",          key: "handover_end",                 format: "date" },
      { label: "Completion Date", key: "actual_phase_completion_date", format: "date", fullWidth: true },
      { label: "Notes",           key: "handover_notes",               format: "text", fullWidth: true },
    ],
  },
];



function PhaseCard({ ph, project, isCurrent, isPast, people }: {
  ph: PhaseDef;
  project: ProjectDetail;
  isCurrent: boolean;
  isPast: boolean;
  people: PersonRow[];
}) {
  function renderValue(f: FieldDef): string {
    const raw = project[f.key];
    if (raw === null || raw === undefined || raw === "") return "—";
    if (f.format === "date") return fmtDate(raw as string | null);
    if (f.format === "currency") return fmtCurrency(raw as string | null);
    return String(raw);
  }

  const phasePeople = people.filter(p => p.phase_id === ph.phaseId);
  const assignedBy  = phasePeople.filter(p => p.role_code === "approver" || p.role_code === "requester");

  return (
    <div
      className="rounded-xl border overflow-hidden transition-all"
      style={{
        borderColor: isCurrent ? `${ph.color}60` : isPast ? `${ph.color}28` : "rgba(255,255,255,0.06)",
        boxShadow: isCurrent ? `0 2px 16px ${ph.color}18` : "none",
        opacity: !isCurrent && !isPast ? 0.65 : 1,
      }}
    >
      <div
        className="flex items-center gap-3 px-3.5 py-3"
        style={{ backgroundColor: isCurrent ? `${ph.color}18` : isPast ? `${ph.color}0a` : `${ph.color}06` }}
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ph.color, opacity: isCurrent ? 1 : 0.5 }} />
        <span className="flex-1 text-xs font-bold uppercase tracking-wider" style={{ color: isCurrent ? ph.color : `${ph.color}99` }}>
          {ph.label}
          {isCurrent && (
            <span className="ml-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full align-middle" style={{ backgroundColor: `${ph.color}28`, color: ph.color }}>
              CURRENT
            </span>
          )}
        </span>
      </div>

      <div className="px-4 py-3 bg-white/40 dark:bg-zinc-900/30 space-y-3">
        {/* Main params + Assigned By */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {ph.fields.filter(f => f.label !== "Notes").map(f => {
            const val = renderValue(f);
            return (
              <div key={f.key as string} className={f.fullWidth ? "col-span-2" : ""}>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">{f.label}</p>
                <p className={`font-semibold ${f.fullWidth ? "text-[11px] leading-relaxed" : "text-xs"} ${val === "—" ? "text-slate-500 dark:text-slate-600 italic" : "text-slate-700 dark:text-slate-200"}`}>
                  {val}
                </p>
              </div>
            );
          })}

          {/* Assigned By */}
          <div className="col-span-2">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Assigned By</p>
            {assignedBy.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {assignedBy.map(a => (
                  <span key={a.id} className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/6 px-2 py-0.5 rounded-md">
                    <User size={9} className="text-slate-400 shrink-0" />
                    {a.full_name ?? a.raw_person_name ?? "—"}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[10px] italic text-slate-400 dark:text-slate-600">—</p>
            )}
          </div>
        </div>

        {/* Notes — separated */}
        {ph.fields.filter(f => f.label === "Notes").map(f => {
          const val = renderValue(f);
          return (
            <div key={f.key as string} className="pt-2 border-t border-slate-200/40 dark:border-white/6">
              <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-0.5">Notes</p>
              <p className={`text-[11px] leading-relaxed font-semibold ${val === "—" ? "text-slate-500 dark:text-slate-600 italic" : "text-slate-700 dark:text-slate-200"}`}>
                {val}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [people, setPeople]   = useState<PersonRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
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
          setAttachments(json.data.attachments ?? []);
        } else {
          setError(json.error ?? "Unknown error");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

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
        <button onClick={() => router.back()} className="text-xs text-cyan-500 underline">
          Back to Projects
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-10 animate-page-enter">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Go Back
        </button>
        <button
          onClick={() => router.push(`/dashboard/projects/${id}/audit`)}
          className="ml-auto shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200/60 dark:border-white/10 bg-white/60 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 hover:border-cyan-400/50 hover:text-cyan-500 dark:hover:text-cyan-400 transition-all text-xs font-semibold"
        >
          <Clock size={13} />
          View Audit Log
        </button>
      </div>

      {/* Summary is shown inside phase notes/cards; keep top area focused on project metadata. */}

      {/* Team/stakeholder details are shown inside Project Description fields. */}

      {/* ── Single combined card: Description → Phase Parameters ── */}
      <div className="glass-card overflow-hidden">

        {/* Project Description */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
          <FileText size={13} className="text-cyan-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Project Description</h3>
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-200/50 dark:divide-white/8">

          {/* ── Left: Project Name, ID, Priority ── */}
          <div className="p-4 space-y-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Project Name</p>
              <p className="text-base font-bold text-slate-700 dark:text-slate-200 leading-snug">{project.project_name}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Project ID</p>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded inline-block">
                {project.project_code}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Priority</p>
              {project.priority_name ? (
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-md"
                  style={{ backgroundColor: `${project.priority_color}20`, color: project.priority_color ?? undefined }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: project.priority_color ?? undefined }} />
                  {project.priority_name}
                </span>
              ) : (
                <span className="text-sm italic text-slate-400 dark:text-slate-600">—</span>
              )}
            </div>
          </div>

          {/* ── Right: Location, Attachments, Stakeholders ── */}
          <div className="p-4 space-y-4">
            {/* Location */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1.5">
                <Building2 size={11} className="text-slate-400" />
                Location
              </p>
              <div className="px-3 py-2 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 text-slate-400 dark:text-slate-600">
                <span className="text-xs italic">Address not specified</span>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                <Paperclip size={11} className="text-slate-400" />
                Attachments
              </p>
              {attachments.length > 0 ? (
                <div className="space-y-1.5">
                  {attachments.map(att => {
                    const isImage = (att.mime_type ?? "").startsWith("image/");
                    return (
                      <a
                        key={att.id}
                        href={att.file_url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 rounded-lg border border-slate-200/70 dark:border-white/8 bg-white/60 dark:bg-white/3 px-3 py-2 hover:border-cyan-300/70 dark:hover:border-cyan-400/40 transition-colors"
                      >
                        {isImage && att.file_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={att.file_url} alt={att.file_name} className="h-8 w-8 rounded object-cover border border-slate-200/70 dark:border-white/10 shrink-0" />
                        ) : (
                          <div className="h-8 w-8 rounded border border-slate-200/70 dark:border-white/10 flex items-center justify-center text-slate-400 shrink-0">
                            <FileText size={14} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{att.file_name}</p>
                          <p className="text-[10px] text-slate-400">
                            {att.phase_name ?? "Project"} · {att.uploaded_by_name ?? att.source_channel ?? "Uploaded"}
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="px-3 py-2 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 text-slate-400 dark:text-slate-600">
                  <span className="text-xs italic">No attachments</span>
                </div>
              )}
            </div>

            {/* Stakeholders */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                <Users size={11} className="text-slate-400" />
                Stakeholders
              </p>
              {people.some(p => p.role_code === "stakeholder") ? (
                <div className="flex flex-wrap gap-1.5">
                  {people.filter(p => p.role_code === "stakeholder").map(s => (
                    <span key={s.id} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/6 px-2 py-1 rounded-md">
                      <Building2 size={10} className="text-slate-400 shrink-0" />
                      {s.full_name ?? s.raw_person_name ?? s.raw_organization_name ?? "—"}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="px-3 py-2 rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 text-slate-400 dark:text-slate-600">
                  <span className="text-xs italic">No stakeholders</span>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* ── Divider ── */}
        <div className="border-t border-slate-200/60 dark:border-white/10" />

        {/* Phase Parameters */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
          <Activity size={13} className="text-cyan-500 shrink-0" />
          <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Phase Parameters</h3>
        </div>

        {/* Phase flow stepper */}
        <div className="px-4 pt-4 pb-4 border-b border-slate-200/50 dark:border-white/8">
          <div className="flex items-stretch gap-1">
            {PHASE_DEFS.map((ph, i) => {
              const currentIdx = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
              const isCurrent = i === currentIdx;
              const isPast = i < currentIdx;
              return (
                <Fragment key={ph.key}>
                  <div
                    className="flex-1 flex flex-col items-center justify-center px-2 py-2.5 rounded-xl text-center transition-all"
                    style={{
                      backgroundColor: isCurrent ? `${ph.color}22` : isPast ? `${ph.color}10` : "rgba(255,255,255,0.02)",
                      border: `1.5px solid ${isCurrent ? `${ph.color}70` : isPast ? `${ph.color}35` : "rgba(255,255,255,0.06)"}`,
                      opacity: !isCurrent && !isPast ? 0.5 : 1,
                    }}
                  >
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full mb-1 animate-pulse" style={{ backgroundColor: ph.color }} />}
                    {isPast && <span className="text-[9px] mb-1 leading-none" style={{ color: ph.color }}>✓</span>}
                    {!isCurrent && !isPast && <span className="text-[9px] mb-1 leading-none text-slate-600">○</span>}
                    <span
                      className="text-[8px] font-extrabold uppercase tracking-wider leading-tight block"
                      style={{ color: isCurrent ? ph.color : isPast ? `${ph.color}cc` : "#475569" }}
                    >
                      {ph.label}
                    </span>
                  </div>
                  {i < PHASE_DEFS.length - 1 && (
                    <div className="self-center shrink-0 text-slate-600 dark:text-slate-700">
                      <ChevronRight size={10} />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>

        {/* Phase details */}
        <div className="p-4 space-y-2">
          {PHASE_DEFS.map((ph) => {
            const currentIdx = PHASE_DEFS.findIndex(p => p.phaseCode === project.current_phase_code);
            const phIdx = PHASE_DEFS.findIndex(p => p.key === ph.key);
            return (
              <PhaseCard
                key={ph.key}
                ph={ph}
                project={project}
                isCurrent={project.current_phase_code === ph.phaseCode}
                isPast={phIdx < currentIdx}
                people={people}
              />
            );
          })}
        </div>

      </div>

      {/* ── S-Curve ────────────────────────────────────────────────────── */}
      {scProject && (
        <SCurveCharts projects={[scProject]} hidePhaseDetails />
      )}

    </div>
  );
}
