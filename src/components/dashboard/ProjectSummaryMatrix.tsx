"use client";

import { format, isValid } from "date-fns";
import { useRef, useState } from "react";

type SummaryProject = {
  id: string;
  project_code?: string | null;
  project_name: string;
  unit_code?: string | null;
  unit_name?: string | null;
  operational_brief?: string | null;
  brief_received?: string | null;
  budget_capex?: string | null;
  design_start?: string | null;
  design_end?: string | null;
  design_duration_days?: number | string | null;
  design_brief?: string | null;
  working_drawing_status?: string | null;
  control_start?: string | null;
  control_end?: string | null;
  project_control_duration_days?: number | string | null;
  phase_contract_amount?: string | null;
  pm_start?: string | null;
  pm_end?: string | null;
  actual_phase_completion_date?: string | null;
  deviation_days?: number | string | null;
  current_site_progress?: string | null;
  pm_remarks?: string | null;
  handover_start?: string | null;
  handover_end?: string | null;
};

interface Props {
  projects: SummaryProject[];
  title?: string;
  subtitle?: string;
}

function toDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isValid(d) ? d : null;
}

function fmtSummaryDate(value: string | null | undefined): string {
  const d = toDate(value);
  return d ? format(d, "dd MMM yy") : "—";
}

function fmtSummaryText(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function fmtSummaryMoney(value: string | null | undefined): string {
  if (!value) return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return n === 0 ? "0" : "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);
}

function fmtSummaryDuration(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n > 0 ? `+${n}` : String(n);
}

function projectDisplayName(p: SummaryProject): string {
  const parts = p.project_name.split(" - ");
  return parts.length > 1 ? parts.slice(1).join(" - ") : p.project_name;
}

function toInputDate(val: string | null | undefined): string {
  if (!val) return "";
  const d = new Date(val);
  return isValid(d) ? format(d, "yyyy-MM-dd") : "";
}

// ─── InlineCell ───────────────────────────────────────────────────────────────
type CellType = "text" | "date" | "money" | "readonly";

function InlineCell({
  value,
  type,
  projectId,
  field,
  onSaved,
  className = "",
}: {
  value: string | number | null | undefined;
  type: CellType;
  projectId: string;
  field: keyof SummaryProject;
  onSaved: (field: keyof SummaryProject, newVal: string | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  if (type === "readonly") {
    const display =
      type === "readonly"
        ? fmtSummaryDuration(value as number | string | null)
        : "—";
    return <span className={className}>{display}</span>;
  }

  function startEdit() {
    let initial = "";
    if (type === "date") initial = toInputDate(value as string | null);
    else initial = value !== null && value !== undefined ? String(value) : "";
    setDraft(initial);
    setEditing(true);
    setTimeout(() => (type === "text" ? taRef.current?.focus() : inputRef.current?.focus()), 0);
  }

  async function commit() {
    setEditing(false);
    const raw = draft.trim() === "" ? null : draft.trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field, value: raw }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false) {
        console.error(`[InlineCell] PATCH failed for field "${field}":`, json.error ?? res.status);
        return;
      }
      onSaved(field, raw);
    } catch (e) {
      console.error(`[InlineCell] PATCH error for field "${field}":`, e);
    } finally {
      setSaving(false);
    }
  }

  const displayText =
    type === "date" ? fmtSummaryDate(value as string)
    : type === "money" ? fmtSummaryMoney(value as string)
    : fmtSummaryText(value);

  const isEmpty = displayText === "—";
  const baseCls = `${className} ${saving ? "opacity-40" : ""}`;

  if (editing) {
    const inputCls = "w-full bg-white dark:bg-zinc-800 border border-cyan-400 rounded px-1 py-0.5 text-[10px] outline-none ring-1 ring-cyan-400/40 min-w-[80px]";
    return type === "text" ? (
      <textarea
        ref={taRef}
        value={draft}
        rows={3}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit(); }}
        className={inputCls + " resize-none"}
        style={{ minWidth: 140 }}
      />
    ) : (
      <input
        ref={inputRef}
        type={type === "date" ? "date" : "text"}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); if (e.key === "Enter") commit(); }}
        className={inputCls}
      />
    );
  }

  return (
    <span
      onClick={startEdit}
      title="Klik untuk edit"
      className={`cursor-pointer group inline-block w-full rounded px-0.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 hover:outline hover:outline-cyan-300 dark:hover:outline-cyan-700 transition-all ${baseCls}`}
    >
      <span className={isEmpty ? "italic text-slate-400 dark:text-slate-600" : ""}>{displayText}</span>
    </span>
  );
}

export default function ProjectSummaryMatrix({
  projects: initialProjects,
  title = "Project Summary Matrix",
  subtitle = "Excel-style phase parameters sourced from the same Gantt data",
}: Props) {
  const [projects, setProjects] = useState<SummaryProject[]>(initialProjects);

  // Sync if parent re-fetches
  if (initialProjects !== projects && initialProjects.length !== projects.length) {
    setProjects(initialProjects);
  }

  function onSaved(projectId: string, field: keyof SummaryProject, newVal: string | null) {
    setProjects(prev =>
      prev.map(p => p.id === projectId ? { ...p, [field]: newVal } : p)
    );
  }

  const summaryGroups = (() => {
    const groups = new Map<string, SummaryProject[]>();
    for (const project of projects) {
      const key = project.unit_code || project.unit_name || "—";
      const list = groups.get(key) ?? [];
      list.push(project);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).map(([unit, rows]) => ({ unit, rows }));
  })();

  return (
    <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-white/8 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wide">{title}</h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">
          {projects.length} projects
        </span>
      </div>

      <div className="max-h-[calc(100vh-180px)] overflow-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700">
        <table className="min-w-[2200px] w-full border-collapse text-[10px] text-slate-700 dark:text-slate-200">
          <thead className="sticky top-0 z-40 shadow-sm">
            <tr className="bg-slate-100 dark:bg-zinc-900 text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th rowSpan={2} className="sticky left-0 z-50 w-20 min-w-20 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2 text-left">Unit</th>
              <th rowSpan={2} className="sticky left-20 z-50 w-12 min-w-12 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2">No</th>
              <th rowSpan={2} className="sticky left-32 z-50 w-72 min-w-72 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2 text-left shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]">Description</th>
              <th colSpan={3} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-slate-200/70 dark:bg-zinc-800/80">Operational Brief (PR)</th>
              <th colSpan={5} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-blue-100/70 dark:bg-blue-950/30">Design (HoD)</th>
              <th colSpan={4} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-amber-100/80 dark:bg-amber-950/30">Project Control</th>
              <th colSpan={6} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-teal-100/70 dark:bg-teal-950/30">Project Management Team</th>
              <th colSpan={2} className="border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-emerald-100/70 dark:bg-emerald-950/30">Handover</th>
            </tr>
            <tr className="bg-white dark:bg-zinc-950 text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {["Brief", "Received Date", "Budget / CAPEX", "Start Design Date", "Design Approval (+1 month)", "Duration: delay(-) / +", "Brief", "Working Drawing (+3 weeks)", "Tender Start", "APS = SPK Released (+3 weeks)", "Duration: delay(-) / +", "Contract Amount", "Commence Date", "End Contract", "Actual Completion", "Deviation: delay(-) / +", "Current Site Progress", "Remarks", "BAST-1", "BAST-2"].map((label, idx) => (
                <th key={`${label}-${idx}`} className="min-w-28 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 align-bottom leading-tight text-left last:border-r-0">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaryGroups.length === 0 ? (
              <tr>
                <td colSpan={23} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">No projects match your filter.</td>
              </tr>
            ) : summaryGroups.map(group => group.rows.map((project, idx) => (
              <tr key={project.id} className="group odd:bg-white even:bg-slate-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900 hover:bg-cyan-50/30 dark:hover:bg-cyan-950/10 transition-colors">
                {idx === 0 && (
                  <td rowSpan={group.rows.length} className="sticky left-0 z-30 w-20 min-w-20 border-r border-b border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950 px-2 py-2 font-extrabold text-slate-700 dark:text-white align-top">
                    {group.unit}
                  </td>
                )}
                <td className="sticky left-20 z-20 w-12 min-w-12 border-r border-b border-slate-200 dark:border-white/10 bg-white group-odd:bg-white group-even:bg-slate-50 dark:bg-zinc-950 dark:group-even:bg-zinc-900 px-2 py-2 text-center font-mono text-slate-500">{project.project_code || project.id}</td>
                <td className="sticky left-32 z-20 w-72 min-w-72 border-r border-b border-slate-200 dark:border-white/10 bg-white group-odd:bg-white group-even:bg-slate-50 dark:bg-zinc-950 dark:group-even:bg-zinc-900 px-2 py-2 font-semibold text-slate-800 dark:text-white leading-snug shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]">{projectDisplayName(project)}</td>

                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">
                  <InlineCell value={project.operational_brief} type="text" projectId={project.id} field="operational_brief" onSaved={(f, v) => onSaved(project.id, f, v)} />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.brief_received} type="date" projectId={project.id} field="brief_received" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.budget_capex} type="money" projectId={project.id} field="budget_capex" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono text-right whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.design_start} type="date" projectId={project.id} field="design_start" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.design_end} type="date" projectId={project.id} field="design_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">
                  {fmtSummaryDuration(project.design_duration_days)}
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">
                  <InlineCell value={project.design_brief} type="text" projectId={project.id} field="design_brief" onSaved={(f, v) => onSaved(project.id, f, v)} />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">
                  <InlineCell value={project.working_drawing_status} type="text" projectId={project.id} field="working_drawing_status" onSaved={(f, v) => onSaved(project.id, f, v)} />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.control_start} type="date" projectId={project.id} field="control_start" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.control_end} type="date" projectId={project.id} field="control_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">
                  {fmtSummaryDuration(project.project_control_duration_days)}
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.phase_contract_amount} type="money" projectId={project.id} field="phase_contract_amount" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono text-right whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.pm_start} type="date" projectId={project.id} field="pm_start" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.pm_end} type="date" projectId={project.id} field="pm_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.actual_phase_completion_date} type="date" projectId={project.id} field="actual_phase_completion_date" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">
                  {fmtSummaryDuration(project.deviation_days)}
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">
                  <InlineCell value={project.current_site_progress} type="text" projectId={project.id} field="current_site_progress" onSaved={(f, v) => onSaved(project.id, f, v)} />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">
                  <InlineCell value={project.pm_remarks} type="text" projectId={project.id} field="pm_remarks" onSaved={(f, v) => onSaved(project.id, f, v)} />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.handover_start} type="date" projectId={project.id} field="handover_start" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.handover_end} type="date" projectId={project.id} field="handover_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
