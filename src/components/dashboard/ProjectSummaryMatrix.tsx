"use client";

import { format, isValid } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Loader2 } from "lucide-react";

type SummaryProject = {
  id: string;
  project_code?: string | null;
  project_name: string;
  unit_code?: string | null;
  unit_name?: string | null;
  // Phase 1 — Operational Brief
  operational_brief?: string | null;
  brief_received?: string | null;
  budget_capex?: string | null;
  // Phase 2 — Design
  design_start?: string | null;
  design_approval_target?: string | null; // calculated: design_start + 1 month
  design_end?: string | null;             // real approval date
  design_duration_days?: number | string | null;
  design_brief?: string | null;
  working_drawing_status?: string | null;
  // Phase 3 — Project Control
  control_start?: string | null;
  aps_spk_target?: string | null;
  control_end?: string | null;
  aps_date?: string | null;
  project_control_duration_days?: number | string | null;
  contract_file_url?: string | null;
  contract_file_name?: string | null;
  phase_contract_amount?: string | null;
  // Phase 4 — Project Management
  pm_start?: string | null;
  pm_end?: string | null;
  pm_actual_end?: string | null;          // COMPLETION real date
  deviation_days?: number | string | null;
  pm_duration_days?: number | string | null; // calculated: pm_end - pm_start
  current_site_progress?: string | null;
  pm_remarks?: string | null;
  // Phase 5 — Handover
  handover_start?: string | null;
  handover_end?: string | null;
};

interface Props {
  projects: SummaryProject[];
  className?: string;
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
    const inputCls = "w-full bg-slate-50 dark:bg-white/4 border border-brand-sienna/60 rounded-lg px-1 py-0.5 text-[10px] outline-none ring-1 ring-brand-sienna/20 min-w-[80px] text-slate-700 dark:text-slate-200";
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
      title="Click to edit"
      className={`cursor-pointer group inline-block w-full rounded px-0.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 hover:outline hover:outline-cyan-300 dark:hover:outline-cyan-700 transition-all ${baseCls}`}
    >
      <span className={isEmpty ? "italic text-slate-400 dark:text-slate-600" : ""}>{displayText}</span>
    </span>
  );
}

function InlineContractCell({
  projectId, fileUrl, fileName,
  onUploaded,
}: {
  projectId: string;
  fileUrl: string | null;
  fileName: string | null;
  onUploaded: (url: string, name: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("week_key", "contract");
      const res = await fetch(`/api/projects/${projectId}/attachments`, { method: "POST", body: form });
      const data = await res.json();
      if (data.success) onUploaded(data.data.file_url, data.data.file_name);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <input ref={inputRef} type="file" className="hidden" onChange={handleFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.png" />
      {fileUrl ? (
        <a href={fileUrl} target="_blank" rel="noreferrer"
          className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline truncate" title={fileName ?? undefined}>
          {fileName ?? "File"}
        </a>
      ) : (
        <span className="text-[10px] italic text-slate-400 dark:text-slate-600">—</span>
      )}
      <button onClick={() => inputRef.current?.click()} disabled={uploading}
        className="shrink-0 text-slate-400 hover:text-cyan-500 transition-colors p-0.5 rounded"
        title={fileUrl ? "Replace file" : "Attach contract"}>
        {uploading ? <Loader2 size={10} className="animate-spin" /> : <Paperclip size={10} />}
      </button>
    </div>
  );
}

export default function ProjectSummaryMatrix({
  projects: initialProjects,
  className = "",
}: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<SummaryProject[]>(initialProjects);
  const [innerWidth, setInnerWidth] = useState(3200);

  const topScrollRef  = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyRef       = useRef<HTMLDivElement>(null);
  const syncingRef    = useRef(false);

  // Sync if parent re-fetches
  if (initialProjects !== projects && initialProjects.length !== projects.length) {
    setProjects(initialProjects);
  }

  useEffect(() => {
    if (bodyRef.current) setInnerWidth(bodyRef.current.scrollWidth);
  }, [projects]);

  function syncScroll(sourceLeft: number) {
    if (syncingRef.current) return;
    syncingRef.current = true;
    if (topScrollRef.current)    topScrollRef.current.scrollLeft    = sourceLeft;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = sourceLeft;
    if (bodyRef.current)         bodyRef.current.scrollLeft         = sourceLeft;
    syncingRef.current = false;
  }

  function onTopScroll()    { syncScroll(topScrollRef.current?.scrollLeft    ?? 0); }
  function onHeaderScroll() { syncScroll(headerScrollRef.current?.scrollLeft ?? 0); }
  function onBodyScroll()   { syncScroll(bodyRef.current?.scrollLeft         ?? 0); }

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

  const COL_WIDTHS = [80, 288, ...Array(25).fill(112)];

  return (
    <div className={`flex flex-col rounded-xl border border-slate-200/60 dark:border-white/8 bg-white/60 dark:bg-zinc-900/50 backdrop-blur-sm ${className}`} style={{ overflow: "clip" }}>

      {/* ── Sticky header section — page-level sticky, outside body scroll container ── */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 rounded-t-2xl shadow-sm">
        {/* Top scrollbar strip */}
        <div ref={topScrollRef} className="overflow-x-auto border-b border-slate-200/40 dark:border-white/6" onScroll={onTopScroll}>
          <div style={{ width: innerWidth, height: 1 }} />
        </div>
        {/* Sticky column headers — horizontally synced */}
        <div ref={headerScrollRef} className="overflow-x-hidden" onScroll={onHeaderScroll}>
          <table className="w-full border-separate border-spacing-0 text-[10px]" style={{ minWidth: innerWidth }}>
            <colgroup>{COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w, minWidth: w }} />)}</colgroup>
            <thead>
              <tr className="bg-slate-100 dark:bg-zinc-900 text-[9px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th rowSpan={2} className="sticky left-0 z-50 w-20 min-w-20 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2 text-left">Unit</th>
                <th rowSpan={2} className="sticky left-20 z-50 w-72 min-w-72 border-r border-b border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-zinc-900 px-2 py-2 text-left shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)]">Description</th>
                <th colSpan={3} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-slate-200/70 dark:bg-zinc-800/80">Operational Brief (PR)</th>
                <th colSpan={6} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-blue-100/70 dark:bg-blue-950/30">Design (HoD)</th>
                <th colSpan={7} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-amber-100/80 dark:bg-amber-950/30">Project Control</th>
                <th colSpan={7} className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-teal-100/70 dark:bg-teal-950/30">Project Management Team</th>
                <th colSpan={2} className="border-b border-slate-200 dark:border-white/10 px-2 py-2 bg-emerald-100/70 dark:bg-emerald-950/30">Handover</th>
              </tr>
              <tr className="bg-white dark:bg-zinc-950 text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {[
                  "Brief", "Received Date", "Budget / CAPEX",
                  "Start Design", "Design Approval — Target (+1M)", "Design Approval — Real", "Duration (+/-)", "Brief", "Working Drawing (+3W)",
                  "Tender Start", "Tender Finish Target (+3W)", "Tender Finish Real", "Duration (+/-)", "APS", "Contract", "Contract Amount",
                  "+/-", "START", "END", "Completion real date", "Duration (weeks)", "+/-", "Progress %",
                  "BAST-1", "BAST-2",
                ].map((label, idx) => (
                  <th key={`${label}-${idx}`} className="min-w-28 border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 align-bottom leading-tight text-left last:border-r-0">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>

      {/* ── Body — horizontal scroll only, page handles vertical ── */}
      <div ref={bodyRef} className="flex-1 min-h-0 overflow-x-auto overflow-y-auto no-scrollbar" onScroll={onBodyScroll}>
        <table className="w-full border-separate border-spacing-0 text-[10px] text-slate-700 dark:text-slate-200" style={{ minWidth: innerWidth }}>
          <colgroup>{COL_WIDTHS.map((w, i) => <col key={i} style={{ width: w, minWidth: w }} />)}</colgroup>
          <tbody>
            {summaryGroups.length === 0 ? (
              <tr>
                <td colSpan={22} className="px-4 py-8 text-center text-slate-400 dark:text-slate-500">No projects match your filter.</td>
              </tr>
            ) : summaryGroups.map(group => group.rows.map((project, idx) => (
              <tr key={project.id} className="group odd:bg-white even:bg-slate-50 dark:odd:bg-zinc-950 dark:even:bg-zinc-900 hover:bg-cyan-50/30 dark:hover:bg-cyan-950/10 transition-colors">
                {idx === 0 && (
                  <td rowSpan={group.rows.length} className="sticky left-0 z-30 w-20 min-w-20 border-r border-b border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950 px-2 py-2 font-extrabold text-slate-700 dark:text-white align-top">
                    {group.unit}
                  </td>
                )}
                <td
                  className="sticky left-20 z-20 w-72 min-w-72 border-r border-b border-slate-200 dark:border-white/10 bg-white group-odd:bg-white group-even:bg-slate-50 dark:bg-zinc-950 dark:group-even:bg-zinc-900 px-2 py-2 font-semibold leading-snug shadow-[8px_0_12px_-12px_rgba(15,23,42,0.45)] cursor-pointer hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors text-slate-800 dark:text-white"
                  onClick={() => router.push(`/dashboard/projects/${project.id}?from=summary`)}
                >{projectDisplayName(project)}</td>

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
                {/* Design Approval — Target (calculated, readonly) */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap text-[10px]">
                  {fmtSummaryDate(project.design_approval_target)}
                </td>
                {/* Design Approval — Real (editable) */}
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
                {/* APS/SPK Target (calculated, readonly) */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap text-[10px]">
                  {fmtSummaryDate(project.aps_spk_target)}
                </td>
                {/* APS/SPK Real (editable) */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.control_end} type="date" projectId={project.id} field="control_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center">
                  {fmtSummaryDuration(project.project_control_duration_days)}
                </td>
                {/* APS date */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.aps_date} type="date" projectId={project.id} field="aps_date" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                {/* Contract file attachment */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineContractCell
                    projectId={project.id}
                    fileUrl={project.contract_file_url ?? null}
                    fileName={project.contract_file_name ?? null}
                    onUploaded={(url, name) => {
                      onSaved(project.id, "contract_file_url", url);
                      onSaved(project.id, "contract_file_name", name);
                    }}
                  />
                </td>
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.phase_contract_amount} type="money" projectId={project.id} field="phase_contract_amount" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono text-right whitespace-nowrap" />
                </td>
                {/* PROJECT: +/- (deviation) */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center text-[10px]">
                  <span className={Number(project.deviation_days) < 0 ? "text-red-500" : Number(project.deviation_days) > 0 ? "text-emerald-600" : "text-slate-400"}>
                    {fmtSummaryDuration(project.deviation_days)}
                  </span>
                </td>
                {/* PROJECT: START */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.pm_start} type="date" projectId={project.id} field="pm_start" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                {/* PROJECT: END target */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.pm_end} type="date" projectId={project.id} field="pm_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                {/* COMPLETION: real date */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2">
                  <InlineCell value={project.pm_actual_end} type="date" projectId={project.id} field="pm_actual_end" onSaved={(f, v) => onSaved(project.id, f, v)} className="font-mono whitespace-nowrap" />
                </td>
                {/* duration: month (weeks) */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center text-[10px] text-slate-500 dark:text-slate-400">
                  {project.pm_duration_days ? `${Math.round(Number(project.pm_duration_days) / 7)}w` : "—"}
                </td>
                {/* duration: +/- (deviation days) */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 font-mono text-center text-[10px]">
                  <span className={Number(project.deviation_days) < 0 ? "text-red-500" : Number(project.deviation_days) > 0 ? "text-emerald-600" : "text-slate-400"}>
                    {fmtSummaryDuration(project.deviation_days)}
                  </span>
                </td>
                {/* progress ss % */}
                <td className="border-r border-b border-slate-200 dark:border-white/10 px-2 py-2 whitespace-pre-wrap">
                  <InlineCell value={project.current_site_progress} type="text" projectId={project.id} field="current_site_progress" onSaved={(f, v) => onSaved(project.id, f, v)} />
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
