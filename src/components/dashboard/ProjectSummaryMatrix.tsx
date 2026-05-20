"use client";

import { format, isValid } from "date-fns";

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

export default function ProjectSummaryMatrix({
  projects,
  title = "Project Summary Matrix",
  subtitle = "Excel-style phase parameters sourced from the same Gantt data",
}: Props) {
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
    <div className="rounded-2xl border border-slate-200/60 dark:border-white/8 bg-white/70 dark:bg-zinc-900/55 backdrop-blur-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200/60 dark:border-white/8 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-white uppercase tracking-wide">{title}</h3>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20">
          {projects.length} projects
        </span>
      </div>

      <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700">
        <table className="min-w-[2200px] w-full border-collapse text-[10px] text-slate-700 dark:text-slate-200">
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 dark:bg-zinc-900 text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th rowSpan={2} className="sticky left-0 z-20 w-20 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2 text-left">Unit</th>
              <th rowSpan={2} className="w-12 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">No</th>
              <th rowSpan={2} className="w-72 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 text-left">Description</th>
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
              <tr key={project.id} className="odd:bg-white/70 even:bg-slate-50/70 dark:odd:bg-zinc-950/20 dark:even:bg-zinc-900/30 hover:bg-cyan-50/70 dark:hover:bg-cyan-950/20 transition-colors">
                {idx === 0 && (
                  <td rowSpan={group.rows.length} className="sticky left-0 z-10 border-r border-b border-slate-200 dark:border-white/10 bg-inherit px-2 py-2 font-extrabold text-slate-700 dark:text-white align-top">
                    {group.unit}
                  </td>
                )}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 text-center font-mono text-slate-500">{project.project_code || project.id}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-semibold text-slate-800 dark:text-white leading-snug">{projectDisplayName(project)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.operational_brief)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.brief_received)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-right whitespace-nowrap">{fmtSummaryMoney(project.budget_capex)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.design_start)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.design_end)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">{fmtSummaryDuration(project.design_duration_days)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.design_brief)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.working_drawing_status)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.control_start)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.control_end)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">{fmtSummaryDuration(project.project_control_duration_days)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-right whitespace-nowrap">{fmtSummaryMoney(project.phase_contract_amount)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.pm_start)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.pm_end)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.actual_phase_completion_date)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">{fmtSummaryDuration(project.deviation_days)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.current_site_progress)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">{fmtSummaryText(project.pm_remarks)}</td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.handover_start)}</td>
                <td className="border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono whitespace-nowrap">{fmtSummaryDate(project.handover_end)}</td>
              </tr>
            ))) }
          </tbody>
        </table>
      </div>
    </div>
  );
}
