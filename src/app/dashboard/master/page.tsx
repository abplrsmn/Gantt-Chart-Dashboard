"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Pencil, Trash2, X, Eye, EyeOff, Check,
  AlertCircle, Database, UserCog, Users, GripVertical,
} from "lucide-react";
import AnimatedDropdown from "@/components/dashboard/AnimatedDropdown";

// ─── Types ────────────────────────────────────────────────────────────────────

type Unit     = { id: number; unit_code: string; unit_name: string };
type Priority = { id: number; priority_code: string; priority_name: string; color_hex: string; level: number };
type Status   = { id: number; entity_type: string; status_code: string; status_label: string; color: string };
type User     = { id: number; email: string; is_active: boolean; created_at: string; full_name: string | null; department: string | null; job_title: string | null; employee_code: string | null; person_id: number | null };
type Person   = { id: number; employee_code: string | null; full_name: string; nickname: string | null; department: string | null; job_title: string | null; email: string | null; phone_number: string | null; is_active: boolean };
type Phase    = { id: number; phase_code: string; phase_name: string; phase_order?: number; color?: string | null };
type PhaseDetailField = { id: string; phase_id: string; field_key: string; field_label: string; field_type: string; field_order: number; is_required: boolean };
type BuiltinPhaseDetail = { label: string; type: string };

/** Fields that already exist in Project Details and the Summary Matrix. */
const BUILTIN_PHASE_DETAILS: Record<string, BuiltinPhaseDetail[]> = {
  operational_brief: [
    { label: "Brief Received", type: "Date" }, { label: "Brief Deadline", type: "Date" },
    { label: "Budget / CAPEX", type: "Currency" }, { label: "Brief Text", type: "Text" }, { label: "Notes", type: "Text" },
  ],
  design: [
    { label: "Start Design", type: "Date" }, { label: "Approval Target (+1M)", type: "Date" }, { label: "Approval Real", type: "Date" },
    { label: "Duration (+/-)", type: "Number" }, { label: "Brief", type: "Text" }, { label: "Working Drawing (+3W)", type: "Text" }, { label: "Notes", type: "Text" },
  ],
  project_control: [
    { label: "Tender Start", type: "Date" }, { label: "Tender Finish Target (+3W)", type: "Date" }, { label: "Tender Finish Real", type: "Date" },
    { label: "Duration (+/-)", type: "Number" }, { label: "APS Date", type: "Date" }, { label: "Contract Name", type: "Text" }, { label: "Contract Amount", type: "Currency" }, { label: "Notes", type: "Text" },
  ],
  project_management: [
    { label: "Start", type: "Date" }, { label: "End", type: "Date" }, { label: "Completion Real Date", type: "Date" },
    { label: "Duration (weeks)", type: "Calculated" }, { label: "+/- Deviation Days", type: "Number" }, { label: "Progress %", type: "Text" }, { label: "Notes", type: "Text" },
  ],
  handover: [
    { label: "BAST 1", type: "Date" }, { label: "BAST 2", type: "Date" }, { label: "Completion Date", type: "Date" }, { label: "Notes", type: "Text" },
  ],
};

type Tab = "units" | "priorities" | "statuses" | "users" | "stakeholders" | "phases";

const TABS: { key: Tab; label: string; icon?: React.ElementType }[] = [
  { key: "units",        label: "Units" },
  { key: "priorities",   label: "Priorities" },
  { key: "statuses",     label: "Statuses" },
  { key: "users",        label: "User Accounts", icon: UserCog },
  { key: "stakeholders", label: "Stakeholders",  icon: Users },
  { key: "phases",       label: "Phases" },
];

// ─── Safe fetch helper ────────────────────────────────────────────────────────

async function safeFetch(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, init);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * Save helper for the master-data modals. Returns the API error message instead
 * of swallowing it — these forms used to fire-and-forget, so a failed insert
 * (e.g. a NOT NULL violation) closed the modal and looked exactly like success.
 */
async function saveRecord(url: string, method: "POST" | "PATCH", body: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let j: { success?: boolean; error?: string } | null = null;
    try { j = await r.json(); } catch { /* non-JSON response */ }
    if (!r.ok || !j?.success) return j?.error || `Save failed (HTTP ${r.status})`;
    return null;
  } catch {
    return "Network error — could not reach the server.";
  }
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inputCls = "w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 focus:ring-2 focus:ring-brand-sienna/15 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";
const lblCls   = "text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1 block";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={lblCls}>{label}</label>
      {children}
    </div>
  );
}

// ─── Animated Modal ───────────────────────────────────────────────────────────

function Modal({
  title, onClose, children, onSubmit, loading, error,
}: {
  title: string; onClose: () => void; children: React.ReactNode;
  onSubmit: () => void; loading: boolean; error?: string;
}) {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  const close = useCallback(() => {
    setPhase("exit");
    setTimeout(onClose, 200);
  }, [onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [close]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 ${phase === "enter" ? "animate-backdrop-enter" : "animate-backdrop-exit"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) close(); }}
    >
      <div
        className={`relative w-full max-w-md bg-white dark:bg-zinc-950 rounded-xl border border-slate-200/80 dark:border-white/8 overflow-hidden flex flex-col max-h-[90vh] ${phase === "enter" ? "animate-modal-enter" : "animate-modal-exit"}`}
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8 shrink-0">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1">{title}</h3>
          <button
            aria-label="Close"
            onClick={close}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[66vh] overflow-y-auto flex-1">
          {children}
          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25">
              <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-red-600 dark:text-red-400 leading-relaxed wrap-break-word">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200/60 dark:border-white/8 bg-slate-50/80 dark:bg-white/2 shrink-0">
          <button
            onClick={close}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/8 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={loading}
            className="glass-btn-primary flex items-center gap-1.5 px-4! py-2! text-xs font-semibold disabled:opacity-60"
          >
            {loading
              ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Check size={13} />}
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Animated Delete Confirm ──────────────────────────────────────────────────

function DeleteConfirm({ label, onConfirm, onCancel }: { label: string; onConfirm: () => void; onCancel: () => void }) {
  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  const cancel = useCallback(() => { setPhase("exit"); setTimeout(onCancel, 200); }, [onCancel]);
  const confirm = () => { setPhase("exit"); setTimeout(onConfirm, 200); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") cancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [cancel]);

  return createPortal(
    <div
      className={`fixed inset-0 z-[9998] flex items-center justify-center p-4 ${phase === "enter" ? "animate-backdrop-enter" : "animate-backdrop-exit"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) cancel(); }}
    >
      <div
        className={`relative w-full max-w-sm bg-white dark:bg-zinc-950 rounded-xl border border-slate-200/80 dark:border-white/8 p-6 space-y-4 ${phase === "enter" ? "animate-modal-enter" : "animate-modal-exit"}`}
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-red-100 dark:bg-red-500/15 shrink-0">
            <AlertCircle size={18} className="text-red-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Confirm Delete</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Delete <span className="font-semibold text-slate-700 dark:text-slate-200">{label}</span>? This cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={cancel} className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
            Cancel
          </button>
          <button onClick={confirm} className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Table Shell ──────────────────────────────────────────────────────────────

function TableShell({ heads, children, empty }: {
  heads: string[]; children: React.ReactNode; empty?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/8 overflow-hidden">
      <table className="glass-table w-full text-sm text-center">
        <thead>
          <tr>
            {heads.map(h => <th key={h} className="text-center">{h}</th>)}
            <th className="text-right pr-4">Actions</th>
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={heads.length + 1} className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                No records yet — click Add to get started.
              </td>
            </tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <td className="px-4 py-3 text-right whitespace-nowrap">
      <button
        aria-label="Edit"
        onClick={onEdit}
        className="p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors mr-1"
      >
        <Pencil size={15} />
      </button>
      <button
        aria-label="Delete"
        onClick={onDelete}
        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={15} />
      </button>
    </td>
  );
}

// ─── Section: Units ───────────────────────────────────────────────────────────

function UnitsSection({ onAddReady }: { onAddReady: (fn: () => void) => void }) {
  const [data, setData] = useState<Unit[]>([]);
  const [modal, setModal] = useState<null | "add" | Unit>(null);
  const [deleting, setDeleting] = useState<Unit | null>(null);
  const [form, setForm] = useState({ unit_code: "", unit_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await safeFetch("/api/master/units");
    if (j?.success) setData(j.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ unit_code: "", unit_name: "" }); setModal("add"); };
  useEffect(() => { onAddReady(openAdd); }, [onAddReady]); // eslint-disable-line
  const openEdit = (u: Unit) => { setForm({ unit_code: u.unit_code, unit_name: u.unit_name }); setModal(u); };

  const submit = async () => {
    setLoading(true);
    setError("");
    const isEdit = modal !== "add";
    const err = await saveRecord(
      isEdit ? `/api/master/units/${(modal as Unit).id}` : "/api/master/units",
      isEdit ? "PATCH" : "POST",
      form
    );
    setLoading(false);
    if (err) { setError(err); return; }   // keep the modal open so the failure is visible
    setModal(null); load();
  };

  return (
    <>
      <TableShell heads={["Code", "Unit Name"]} empty={!data.length}>
        {data.map(u => (
          <tr key={u.id}>
            <td className="px-4 py-3"><span className="font-mono text-xs bg-brand-cream dark:bg-white/10 text-brand-mahogany dark:text-brand-sand px-2 py-0.5 rounded-md font-semibold">{u.unit_code}</span></td>
            <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-medium">{u.unit_name}</td>
            <RowActions onEdit={() => openEdit(u)} onDelete={() => setDeleting(u)} />
          </tr>
        ))}
      </TableShell>
      {modal !== null && (
        <Modal title={modal === "add" ? "Add Unit" : "Edit Unit"} onClose={() => setModal(null)} onSubmit={submit} loading={loading} error={error}>
          <Field label="Unit Code">
            <input className={inputCls} value={form.unit_code} onChange={e => setForm(f => ({ ...f, unit_code: e.target.value }))} placeholder="e.g. JKT" />
          </Field>
          <Field label="Unit Name">
            <input className={inputCls} value={form.unit_name} onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))} placeholder="e.g. Downtown Tower" />
          </Field>
        </Modal>
      )}
      {deleting && <DeleteConfirm label={deleting.unit_name} onConfirm={async () => { await fetch(`/api/master/units/${deleting.id}`, { method: "DELETE" }); setDeleting(null); load(); }} onCancel={() => setDeleting(null)} />}
    </>
  );
}

// ─── Section: Priorities ──────────────────────────────────────────────────────

function PrioritiesSection({ onAddReady }: SectionProps) {
  const [data, setData] = useState<Priority[]>([]);
  const [modal, setModal] = useState<null | "add" | Priority>(null);
  const [deleting, setDeleting] = useState<Priority | null>(null);
  const [form, setForm] = useState({ priority_code: "", priority_name: "", color_hex: "#94a3b8", level: 99 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await safeFetch("/api/master/priorities");
    if (j?.success) setData(j.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm({ priority_code: "", priority_name: "", color_hex: "#94a3b8", level: data.length + 1 }); setModal("add"); };
  useEffect(() => { onAddReady(openAdd); }, [onAddReady]); // eslint-disable-line
  const openEdit = (p: Priority) => { setForm({ priority_code: p.priority_code, priority_name: p.priority_name, color_hex: p.color_hex, level: p.level }); setModal(p); };

  const submit = async () => {
    setLoading(true);
    setError("");
    const isEdit = modal !== "add";
    const err = await saveRecord(
      isEdit ? `/api/master/priorities/${(modal as Priority).id}` : "/api/master/priorities",
      isEdit ? "PATCH" : "POST",
      form
    );
    setLoading(false);
    if (err) { setError(err); return; }   // keep the modal open so the failure is visible
    setModal(null); load();
  };

  return (
    <>
      <TableShell heads={["Code", "Priority", "Color", "Level"]} empty={!data.length}>
        {data.map(p => (
          <tr key={p.id}>
            <td className="px-4 py-3"><span className="font-mono text-xs bg-brand-cream dark:bg-white/10 text-brand-mahogany dark:text-brand-sand px-2 py-0.5 rounded-md font-semibold">{p.priority_code}</span></td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: p.color_hex }}>{p.priority_name}</span>
            </td>
            <td className="px-4 py-3"><div className="w-6 h-6 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm" style={{ backgroundColor: p.color_hex }} /></td>
            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs font-medium">{p.level}</td>
            <RowActions onEdit={() => openEdit(p)} onDelete={() => setDeleting(p)} />
          </tr>
        ))}
      </TableShell>
      {modal !== null && (
        <Modal title={modal === "add" ? "Add Priority" : "Edit Priority"} onClose={() => setModal(null)} onSubmit={submit} loading={loading} error={error}>
          <Field label="Priority Code">
            <input className={inputCls} value={form.priority_code} onChange={e => setForm(f => ({ ...f, priority_code: e.target.value }))} placeholder="e.g. HIGH" />
          </Field>
          <Field label="Priority Name">
            <input className={inputCls} value={form.priority_name} onChange={e => setForm(f => ({ ...f, priority_name: e.target.value }))} placeholder="e.g. High" />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 transition-all">
              <input type="color" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))} className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0" />
              <div className="w-px h-5 bg-slate-200 dark:bg-white/15 shrink-0" />
              <input className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))} placeholder="#94a3b8" />
            </div>
          </Field>
          <Field label="Level (1 = highest)">
            <input type="number" className={inputCls} value={form.level} onChange={e => setForm(f => ({ ...f, level: Number(e.target.value) }))} />
          </Field>
        </Modal>
      )}
      {deleting && <DeleteConfirm label={deleting.priority_name} onConfirm={async () => { await fetch(`/api/master/priorities/${deleting.id}`, { method: "DELETE" }); setDeleting(null); load(); }} onCancel={() => setDeleting(null)} />}
    </>
  );
}

// ─── Section: Statuses ────────────────────────────────────────────────────────

function StatusesSection({ onAddReady }: SectionProps) {
  const [data, setData] = useState<Status[]>([]);
  const [modal, setModal] = useState<null | "add" | Status>(null);
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [form, setForm] = useState({ entity_type: "project", status_code: "", status_label: "", color: "#94a3b8" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await safeFetch("/api/master/statuses");
    if (j?.success) setData(j.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm({ entity_type: "project", status_code: "", status_label: "", color: "#94a3b8" }); setModal("add"); };
  useEffect(() => { onAddReady(openAdd); }, [onAddReady]); // eslint-disable-line
  const openEdit = (s: Status) => { setForm({ entity_type: s.entity_type, status_code: s.status_code, status_label: s.status_label, color: s.color }); setModal(s); };

  const submit = async () => {
    setLoading(true);
    setError("");
    const isEdit = modal !== "add";
    const err = await saveRecord(
      isEdit ? `/api/master/statuses/${(modal as Status).id}` : "/api/master/statuses",
      isEdit ? "PATCH" : "POST",
      form
    );
    setLoading(false);
    if (err) { setError(err); return; }   // keep the modal open so the failure is visible
    setModal(null); load();
  };

  return (
    <>
      <TableShell heads={["Code", "Label", "Color", "Entity Type"]} empty={!data.length}>
        {data.map(s => (
          <tr key={s.id}>
            <td className="px-4 py-3"><span className="font-mono text-xs bg-brand-cream dark:bg-white/10 text-brand-mahogany dark:text-brand-sand px-2 py-0.5 rounded-md font-semibold">{s.status_code}</span></td>
            <td className="px-4 py-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full text-white" style={{ backgroundColor: s.color }}>{s.status_label}</span>
            </td>
            <td className="px-4 py-3"><div className="w-6 h-6 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm" style={{ backgroundColor: s.color }} /></td>
            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{s.entity_type}</td>
            <RowActions onEdit={() => openEdit(s)} onDelete={() => setDeleting(s)} />
          </tr>
        ))}
      </TableShell>
      {modal !== null && (
        <Modal title={modal === "add" ? "Add Status" : "Edit Status"} onClose={() => setModal(null)} onSubmit={submit} loading={loading} error={error}>
          <Field label="Status Code">
            <input className={inputCls} value={form.status_code} onChange={e => setForm(f => ({ ...f, status_code: e.target.value }))} placeholder="e.g. active" />
          </Field>
          <Field label="Label">
            <input className={inputCls} value={form.status_label} onChange={e => setForm(f => ({ ...f, status_label: e.target.value }))} placeholder="e.g. Active" />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 transition-all">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0" />
              <div className="w-px h-5 bg-slate-200 dark:bg-white/15 shrink-0" />
              <input className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#22c55e" />
            </div>
          </Field>
          <Field label="Entity Type">
            <input className={inputCls} value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value }))} placeholder="project" />
          </Field>
        </Modal>
      )}
      {deleting && <DeleteConfirm label={deleting.status_label} onConfirm={async () => { await fetch(`/api/master/statuses/${deleting.id}`, { method: "DELETE" }); setDeleting(null); load(); }} onCancel={() => setDeleting(null)} />}
    </>
  );
}

// ─── Section: Categories ──────────────────────────────────────────────────────

// ─── Section: Users ───────────────────────────────────────────────────────────

function UsersSection({ onAddReady }: SectionProps) {
  const [data, setData] = useState<User[]>([]);
  const [modal, setModal] = useState<null | "add" | User>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", department: "", job_title: "", is_active: true });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await safeFetch("/api/master/users");
    if (j?.success) setData(j.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setForm({ full_name: "", email: "", password: "", department: "", job_title: "", is_active: true });
    setModal("add");
  };
  useEffect(() => { onAddReady(openAdd); }, [onAddReady]); // eslint-disable-line
  const openEdit = (u: User) => {
    setForm({ full_name: u.full_name || "", email: u.email, password: "", department: u.department || "", job_title: u.job_title || "", is_active: u.is_active });
    setModal(u);
  };

  const submit = async () => {
    setLoading(true);
    const isEdit = modal !== "add";
    const body = isEdit
      ? { full_name: form.full_name, is_active: form.is_active, ...(form.password ? { password: form.password } : {}), department: form.department, job_title: form.job_title }
      : form;
    const err = await saveRecord(
      isEdit ? `/api/master/users/${(modal as User).id}` : "/api/master/users",
      isEdit ? "PATCH" : "POST",
      body
    );
    setLoading(false);
    if (err) { setError(err); return; }   // keep the modal open so the failure is visible
    setModal(null); load();
  };

  return (
    <>
      <TableShell heads={["Name", "Email", "Status"]} empty={!data.length}>
        {data.map(u => (
          <tr key={u.id}>
            <td className="px-4 py-3">
              <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{u.full_name || "—"}</div>
              {u.job_title && <div className="text-xs text-slate-400 mt-0.5">{u.job_title}</div>}
            </td>
            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{u.email}</td>
            <td className="px-4 py-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${u.is_active ? "bg-green-100 dark:bg-green-500/15 text-growth-green" : "bg-red-100 dark:bg-red-500/15 text-alert-red"}`}>
                {u.is_active ? "Active" : "Inactive"}
              </span>
            </td>
            <RowActions onEdit={() => openEdit(u)} onDelete={() => setDeleting(u)} />
          </tr>
        ))}
      </TableShell>
      {modal !== null && (
        <Modal title={modal === "add" ? "Add User" : "Edit User"} onClose={() => setModal(null)} onSubmit={submit} loading={loading} error={error}>
          <Field label="Full Name">
            <input className={inputCls} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Budi Santoso" />
          </Field>
          {modal === "add" && (
            <Field label="Email">
              <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@company.com" />
            </Field>
          )}
          <Field label={modal === "add" ? "Password" : "New Password (blank = keep current)"}>
            <div className="relative">
              <input type={showPw ? "text" : "password"} className={`${inputCls} pr-10`} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={modal === "add" ? "min. 8 characters" : "leave blank to keep"} />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <input className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Management" />
            </Field>
            <Field label="Job Title">
              <input className={inputCls} value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Project Manager" />
            </Field>
          </div>
          {modal !== "add" && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-brand-sienna" />
              <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">Active</span>
            </label>
          )}
        </Modal>
      )}
      {deleting && <DeleteConfirm label={deleting.full_name || deleting.email} onConfirm={async () => { await fetch(`/api/master/users/${deleting.id}`, { method: "DELETE" }); setDeleting(null); load(); }} onCancel={() => setDeleting(null)} />}
    </>
  );
}

// ─── Section: Stakeholders ────────────────────────────────────────────────────

function StakeholdersSection({ onAddReady }: SectionProps) {
  const [data, setData] = useState<Person[]>([]);
  const [modal, setModal] = useState<null | "add" | Person>(null);
  const [deleting, setDeleting] = useState<Person | null>(null);
  const [form, setForm] = useState({ full_name: "", email: "", phone_number: "", nickname: "", department: "", job_title: "", is_active: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const j = await safeFetch("/api/master/people?stakeholders_only=1");
    if (j?.success) setData(j.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm({ full_name: "", email: "", phone_number: "", nickname: "", department: "", job_title: "", is_active: true }); setModal("add"); };
  useEffect(() => { onAddReady(openAdd); }, [onAddReady]); // eslint-disable-line
  const openEdit = (p: Person) => {
    setForm({ full_name: p.full_name, email: p.email || "", phone_number: p.phone_number || "", nickname: p.nickname || "", department: p.department || "", job_title: p.job_title || "", is_active: p.is_active });
    setModal(p);
  };

  const submit = async () => {
    setLoading(true);
    setError("");
    const isEdit = modal !== "add";
    const err = await saveRecord(
      isEdit ? `/api/master/people/${(modal as Person).id}` : "/api/master/people",
      isEdit ? "PATCH" : "POST",
      form
    );
    setLoading(false);
    if (err) { setError(err); return; }   // keep the modal open so the failure is visible
    setModal(null); load();
  };

  return (
    <>
      <TableShell heads={["Name", "Email", "Phone", "Department", "Job Title", "Status"]} empty={!data.length}>
        {data.map(p => (
          <tr key={p.id}>
            <td className="px-4 py-3">
              <div className="font-semibold text-slate-800 dark:text-slate-100 text-sm">{p.full_name}</div>
              {p.nickname && <div className="text-xs text-slate-400 mt-0.5">{p.nickname}</div>}
            </td>
            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{p.email || "—"}</td>
            <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">{p.phone_number || "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-sm">{p.department || "—"}</td>
            <td className="px-4 py-3 text-slate-600 dark:text-slate-300 text-sm">{p.job_title || "—"}</td>
            <td className="px-4 py-3">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.is_active ? "bg-green-100 dark:bg-green-500/15 text-growth-green" : "bg-red-100 dark:bg-red-500/15 text-alert-red"}`}>
                {p.is_active ? "Active" : "Inactive"}
              </span>
            </td>
            <RowActions onEdit={() => openEdit(p)} onDelete={() => setDeleting(p)} />
          </tr>
        ))}
      </TableShell>
      {modal !== null && (
        <Modal title={modal === "add" ? "Add Stakeholder" : "Edit Stakeholder"} onClose={() => setModal(null)} onSubmit={submit} loading={loading} error={error}>
          <Field label="Full Name">
            <input className={inputCls} value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Budi Santoso" />
          </Field>
          <Field label="Nickname">
            <input className={inputCls} value={form.nickname} onChange={e => setForm(f => ({ ...f, nickname: e.target.value }))} placeholder="e.g. Budi" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email">
              <input type="email" className={inputCls} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="budi@company.com" />
            </Field>
            <Field label="Phone Number">
              <input type="tel" className={inputCls} value={form.phone_number} onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))} placeholder="+62 812 3456 7890" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Department">
              <input className={inputCls} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Engineering" />
            </Field>
            <Field label="Job Title">
              <input className={inputCls} value={form.job_title} onChange={e => setForm(f => ({ ...f, job_title: e.target.value }))} placeholder="e.g. Site Supervisor" />
            </Field>
          </div>
          {modal !== "add" && (
            <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded accent-brand-sienna" />
              <span className="text-sm text-slate-700 dark:text-slate-200 font-medium">Active</span>
            </label>
          )}
        </Modal>
      )}
      {deleting && <DeleteConfirm label={deleting.full_name} onConfirm={async () => { await fetch(`/api/master/people/${deleting.id}`, { method: "DELETE" }); setDeleting(null); load(); }} onCancel={() => setDeleting(null)} />}
    </>
  );
}

// ─── Section: Phases ──────────────────────────────────────────────────────────

function PhasesSection({ onAddReady }: SectionProps) {
  const [data, setData] = useState<Phase[]>([]);
  const [modal, setModal] = useState<null | "add" | Phase>(null);
  const [deleting, setDeleting] = useState<Phase | null>(null);
  const [form, setForm] = useState({ phase_code: "", phase_name: "", color: "#8b5cf6" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [reorderError, setReorderError] = useState("");
  const [detailsFor, setDetailsFor] = useState<Phase | null>(null);

  const load = useCallback(async () => {
    const j = await safeFetch("/api/master/phases");
    if (j?.success) setData(j.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm({ phase_code: "", phase_name: "", color: "#8b5cf6" }); setError(""); setModal("add"); };
  useEffect(() => { onAddReady(openAdd); }, [onAddReady]); // eslint-disable-line
  const submit = async () => {
    setLoading(true);
    setError("");
    const isEdit = modal !== "add";
    const err = await saveRecord(
      isEdit ? `/api/master/phases/${(modal as Phase).id}` : "/api/master/phases",
      isEdit ? "PATCH" : "POST",
      form
    );
    setLoading(false);
    if (err) { setError(err); return; }   // keep the modal open so the failure is visible
    setModal(null); load();
  };

  /** Commits the dragged row's new position; reverts the list if the API rejects it. */
  async function commitReorder(fromId: number, toId: number) {
    if (fromId === toId) return;
    const fromIdx = data.findIndex(p => p.id === fromId);
    const toIdx   = data.findIndex(p => p.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...data];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);

    const prev = data;
    setData(next);                 // optimistic
    setReorderError("");
    try {
      const res = await fetch("/api/master/phases/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: next.map(p => p.id) }),
      });
      const j = await res.json();
      if (!res.ok || !j?.success) { setData(prev); setReorderError(j?.error || "Failed to save the new order"); return; }
      setData(j.data);
    } catch {
      setData(prev);
      setReorderError("Failed to save the new order");
    }
  }

  return (
    <>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2 px-1">
        Phases run in order as a milestone pipeline — drag a row to change where it sits.
      </p>
      {reorderError && (
        <div className="flex items-start gap-2 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25">
          <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-red-600 dark:text-red-400">{reorderError}</p>
        </div>
      )}
      <TableShell heads={["", "#", "Color", "Code", "Phase Name"]} empty={!data.length}>
        {data.map((p, i) => (
          <tr
            key={p.id}
            draggable
            onDragStart={() => setDragId(p.id)}
            onDragOver={e => { e.preventDefault(); if (overId !== p.id) setOverId(p.id); }}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onDrop={e => {
              e.preventDefault();
              if (dragId != null) commitReorder(dragId, p.id);
              setDragId(null); setOverId(null);
            }}
            className={`transition-colors ${dragId === p.id ? "opacity-40" : ""} ${
              overId === p.id && dragId !== p.id ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
            }`}
          >
            <td className="px-2 py-3 w-8 cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600" title="Drag to reorder">
              <GripVertical size={14} />
            </td>
            <td className="px-4 py-3 text-slate-400 text-xs font-medium w-10">{i + 1}</td>
            <td className="px-4 py-3 w-16">
              <span
                className="inline-block w-5 h-5 rounded-md border border-black/10 dark:border-white/15"
                style={{ backgroundColor: p.color || "#8b5cf6" }}
                title={p.color || "#8b5cf6"}
              />
            </td>
            <td className="px-4 py-3"><span className="font-mono text-xs bg-brand-cream dark:bg-white/10 text-brand-mahogany dark:text-brand-sand px-2 py-0.5 rounded-md font-semibold">{p.phase_code}</span></td>
            <td className="px-4 py-3 text-slate-700 dark:text-slate-200 font-medium">{p.phase_name}</td>
            <RowActions onEdit={() => setDetailsFor(p)} onDelete={() => setDeleting(p)} />
          </tr>
        ))}
      </TableShell>
      {modal !== null && (
        <Modal title={modal === "add" ? "Add Phase" : "Edit Phase"} onClose={() => setModal(null)} onSubmit={submit} loading={loading} error={error}>
          <Field label="Phase Code">
            <input className={inputCls} value={form.phase_code} onChange={e => setForm(f => ({ ...f, phase_code: e.target.value }))} placeholder="e.g. design" />
          </Field>
          <Field label="Phase Name">
            <input className={inputCls} value={form.phase_name} onChange={e => setForm(f => ({ ...f, phase_name: e.target.value }))} placeholder="e.g. Design" />
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 transition-all">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-7 h-7 rounded-lg cursor-pointer border-0 bg-transparent p-0 shrink-0" />
              <div className="w-px h-5 bg-slate-200 dark:bg-white/15 shrink-0" />
              <input className="flex-1 bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#8b5cf6" />
            </div>
          </Field>
        </Modal>
      )}
      {deleting && (
        <DeleteConfirm
          label={deleting.phase_name}
          onConfirm={async () => {
            const res = await fetch(`/api/master/phases/${deleting.id}`, { method: "DELETE" });
            const j = await res.json().catch(() => null);
            setDeleting(null);
            // Built-in phases are refused by the API — surface that instead of
            // silently doing nothing.
            if (!res.ok || !j?.success) setReorderError(j?.error || "Failed to delete phase");
            load();
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
      {detailsFor && <PhaseDetailsModal phase={detailsFor} onClose={() => setDetailsFor(null)} />}
    </>
  );
}

function PhaseDetailsModal({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  const [fields, setFields] = useState<PhaseDetailField[]>([]);
  const [editing, setEditing] = useState<PhaseDetailField | null>(null);
  const [form, setForm] = useState({ field_key: "", field_label: "", field_type: "text", is_required: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const builtinDetails = BUILTIN_PHASE_DETAILS[phase.phase_code] ?? [
    { label: "Start", type: "Date" }, { label: "End", type: "Date" }, { label: "Progress", type: "Percentage" }, { label: "Notes", type: "Text" },
  ];

  const load = useCallback(async () => {
    const data = await safeFetch(`/api/master/phases/${phase.id}/details`);
    if (data?.success) setFields(data.data);
  }, [phase.id]);
  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setEditing(null);
    setForm({ field_key: "", field_label: "", field_type: "text", is_required: false });
    setError("");
  };
  const edit = (field: PhaseDetailField) => {
    setEditing(field);
    setForm({ field_key: field.field_key, field_label: field.field_label, field_type: field.field_type, is_required: field.is_required });
    setError("");
  };
  const save = async () => {
    setLoading(true);
    const method = editing ? "PATCH" : "POST";
    const url = editing ? `/api/master/phases/${phase.id}/details/${editing.id}` : `/api/master/phases/${phase.id}/details`;
    const err = await saveRecord(url, method, form);
    setLoading(false);
    if (err) { setError(err); return; }
    reset();
    load();
  };

  return (
    <Modal title={`${phase.phase_name} — Custom Details`} onClose={onClose} onSubmit={save} loading={loading} error={error}>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        These are the details shown for this phase in Project Details and the Summary Matrix. You can add extra custom details below.
      </p>
      <div className="rounded-lg border border-slate-200/80 dark:border-white/8 bg-slate-50/70 dark:bg-white/4 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">Current phase details</p>
        <div className="grid grid-cols-2 gap-1.5">
          {builtinDetails.map(detail => (
            <div key={detail.label} className="flex items-center justify-between gap-2 rounded-md bg-white dark:bg-zinc-900/70 px-2 py-1.5">
              <span className="min-w-0 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{detail.label}</span>
              <span className="shrink-0 text-[9px] font-semibold text-slate-400">{detail.type}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Add custom detail</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Field Label">
          <input className={inputCls} value={form.field_label} onChange={e => setForm(f => ({ ...f, field_label: e.target.value }))} placeholder="e.g. Permit Number" />
        </Field>
        <Field label="Field Key">
          <input className={inputCls} value={form.field_key} onChange={e => setForm(f => ({ ...f, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))} placeholder="permit_number" />
        </Field>
      </div>
      <Field label="Field Type">
        <AnimatedDropdown
          value={form.field_type}
          onChange={field_type => setForm(f => ({ ...f, field_type }))}
          options={[
            { value: "text", label: "Short text" }, { value: "textarea", label: "Long text" },
            { value: "date", label: "Date" }, { value: "number", label: "Number" },
            { value: "currency", label: "Currency" }, { value: "percentage", label: "Percentage" },
          ]}
          minWidth={180}
        />
      </Field>
      <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
        <input type="checkbox" checked={form.is_required} onChange={e => setForm(f => ({ ...f, is_required: e.target.checked }))} className="accent-brand-sienna" />
        Required field
      </label>
      {editing && <button type="button" onClick={reset} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white">Cancel editing</button>}
      <div className="border-t border-slate-200/70 dark:border-white/8 pt-3 space-y-1">
        {fields.length === 0 ? <p className="text-xs italic text-slate-400">No custom details yet.</p> : fields.map(field => (
          <div key={field.id} className="flex items-center gap-2 rounded-lg px-2 py-2 bg-slate-50 dark:bg-white/4">
            <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{field.field_label}</p><p className="text-[10px] text-slate-400">{field.field_key} · {field.field_type}</p></div>
            <button type="button" onClick={() => edit(field)} className="p-1 text-slate-400 hover:text-brand-sienna"><Pencil size={13} /></button>
            <button type="button" onClick={async () => { await fetch(`/api/master/phases/${phase.id}/details/${field.id}`, { method: "DELETE" }); if (editing?.id === field.id) reset(); load(); }} className="p-1 text-slate-400 hover:text-red-500"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type SectionProps = { onAddReady: (fn: () => void) => void };

function renderSection(tab: Tab, props: SectionProps) {
  switch (tab) {
    case "units":        return <UnitsSection        {...props} />;
    case "priorities":   return <PrioritiesSection   {...props} />;
    case "statuses":     return <StatusesSection     {...props} />;
    case "users":        return <UsersSection        {...props} />;
    case "stakeholders": return <StakeholdersSection {...props} />;
    case "phases":       return <PhasesSection       {...props} />;
  }
}

export default function MasterSetupPage() {
  const [tab, setTab] = useState<Tab>("units");
  const addFnRef = useRef<(() => void) | null>(null);

  const handleAddReady = useCallback((fn: () => void) => {
    addFnRef.current = fn;
  }, []);

  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-3 mt-2">
        <Database size={16} className="text-brand-sienna" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Master Setup</h2>
      </div>

      {/* Main card */}
      <div className="glass-card p-0 overflow-hidden">
        {/* Tab bar + Add button */}
        <div className="flex items-center border-b border-slate-200 dark:border-white/8">
          <div className="flex items-center gap-0 flex-1 overflow-x-auto">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); addFnRef.current = null; }}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-3.5 text-xs font-semibold border-b-2 transition-all duration-200 whitespace-nowrap ${
                  tab === t.key
                    ? "border-brand-sienna text-brand-mahogany dark:text-brand-sand bg-brand-cream/40 dark:bg-brand-sienna/10"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/4"
                }`}
              >
                {t.icon && <t.icon size={12} />}
                {t.label}
              </button>
            ))}
          </div>
          <div className="px-4 shrink-0">
            <button
              onClick={() => addFnRef.current?.()}
              className="glass-btn-primary flex items-center gap-1.5 px-3.5! py-2! text-xs font-semibold"
            >
              <Plus size={13} /> Add
            </button>
          </div>
        </div>

        {/* Section body */}
        <div className="p-5">
          {renderSection(tab, { onAddReady: handleAddReady })}
        </div>
      </div>
    </div>
  );
}
