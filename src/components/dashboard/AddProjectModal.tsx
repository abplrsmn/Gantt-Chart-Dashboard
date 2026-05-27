"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus } from "lucide-react";

type Option = { id: number; code?: string; name: string; color?: string };
type Options = {
  phases:     Option[];
  priorities: Option[];
};

// Phase-specific date field labels keyed by phase_code
const PHASE_DATE_LABELS: Record<string, { start: string; end: string }> = {
  operational_brief:  { start: "Brief Received",  end: "Brief Deadline"   },
  design:             { start: "Start Design",     end: "Design Approval"  },
  project_control:    { start: "Tender Start",     end: "SPK Released"     },
  project_management: { start: "Commence Date",    end: "End Contract"     },
  handover:           { start: "BAST 1",           end: "BAST 2"           },
};

type FormState = {
  project_name:     string;
  unit_name:        string;
  priority_id:      string;
  current_phase_id: string;
  phase_start:      string;
  phase_end:        string;
  start_date:       string;
  end_date:         string;
  summary_brief:    string;
};

const EMPTY: FormState = {
  project_name: "", unit_name: "", priority_id: "",
  current_phase_id: "", phase_start: "", phase_end: "",
  start_date: "", end_date: "", summary_brief: "",
};

export default function AddProjectModal({
  onClose,
  onSuccess,
}: {
  onClose:   () => void;
  onSuccess: () => void;
}) {
  const [options, setOptions] = useState<Options | null>(null);
  const [form,    setForm]    = useState<FormState>(EMPTY);
  const [error,   setError]   = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/master/options")
      .then(r => r.json())
      .then(d => { if (d.success) setOptions({ phases: d.phases, priorities: d.priorities }); })
      .catch(() => {});
    setTimeout(() => nameRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  function set(key: keyof FormState, value: string) {
    // Reset phase dates when phase changes
    if (key === "current_phase_id") {
      setForm(f => ({ ...f, current_phase_id: value, phase_start: "", phase_end: "" }));
      setError(null);
      return;
    }
    setForm(f => ({ ...f, [key]: value }));
    setError(null);
  }

  const selectedPhase     = options?.phases.find(p => String(p.id) === form.current_phase_id);
  const phaseDateLabels   = selectedPhase?.code ? PHASE_DATE_LABELS[selectedPhase.code] : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.project_name.trim()) {
      setError("Project name is required.");
      nameRef.current?.focus();
      return;
    }
    if (!form.start_date || !form.end_date) {
      setError("Project start and end dates are required.");
      return;
    }
    // Close immediately — API fires in background, onSuccess refreshes Gantt
    onClose();
    fetch("/api/projects", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name:     form.project_name.trim(),
        unit_name:        form.unit_name.trim()  || null,
        priority_id:      form.priority_id       ? Number(form.priority_id)     : null,
        current_phase_id: form.current_phase_id  ? Number(form.current_phase_id): null,
        phase_start:      form.phase_start       || null,
        phase_end:        form.phase_end         || null,
        start_date:       form.start_date        || null,
        end_date:         form.end_date          || null,
        summary_brief:    form.summary_brief.trim() || null,
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.success) onSuccess(); })
      .catch(() => {});
  }

  const lbl    = "text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1 block";
  const input  = "w-full rounded-xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 focus:ring-2 focus:ring-brand-sienna/15 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";
  const select = input + " cursor-pointer";

  return createPortal(
    <div
      className="fixed inset-0 z-9998 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-2xl border border-slate-200/80 dark:border-white/8 overflow-hidden"
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--brand-espresso)" }}>
            <Plus size={14} className="text-white" />
          </div>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1">Add New Project</h2>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4 max-h-[62vh] overflow-y-auto">

            {/* Project Name */}
            <div>
              <label className={lbl}>
                Project Name <span className="text-rose-400 normal-case tracking-normal">*</span>
              </label>
              <input
                ref={nameRef}
                type="text"
                value={form.project_name}
                onChange={e => set("project_name", e.target.value)}
                placeholder="e.g. Meeting Room Refresh"
                className={input}
              />
            </div>

            {/* Unit + Priority */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lbl}>Unit</label>
                <input
                  type="text"
                  value={form.unit_name}
                  onChange={e => set("unit_name", e.target.value)}
                  placeholder="e.g. Aryaduta Lippo Village"
                  className={input}
                />
              </div>
              <div>
                <label className={lbl}>Priority</label>
                <select value={form.priority_id} onChange={e => set("priority_id", e.target.value)} className={select}>
                  <option value="">— Select priority</option>
                  {options?.priorities.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Overall project timeline — required */}
            <div>
              <p className={lbl}>
                Project Timeline <span className="text-rose-400 normal-case tracking-normal">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 block">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} className={input} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 block">End Date</label>
                  <input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} className={input} />
                </div>
              </div>
            </div>

            {/* Current Phase */}
            <div>
              <label className={lbl}>Current Phase</label>
              <select value={form.current_phase_id} onChange={e => set("current_phase_id", e.target.value)} className={select}>
                <option value="">— Select phase</option>
                {options?.phases.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Phase-specific dates — shown only when a phase is selected */}
            {phaseDateLabels && (
              <div className="rounded-xl border border-slate-200/70 dark:border-white/8 overflow-hidden">
                <div className="px-3 py-2 bg-slate-50 dark:bg-white/3 border-b border-slate-200/60 dark:border-white/6">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {selectedPhase?.name} Dates
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 p-3">
                  <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">{phaseDateLabels.start}</label>
                    <input type="date" value={form.phase_start} onChange={e => set("phase_start", e.target.value)} className={input} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">{phaseDateLabels.end}</label>
                    <input type="date" value={form.phase_end} onChange={e => set("phase_end", e.target.value)} className={input} />
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            <div>
              <label className={lbl}>Summary <span className="normal-case tracking-normal text-slate-300">(optional)</span></label>
              <textarea
                value={form.summary_brief}
                onChange={e => set("summary_brief", e.target.value)}
                placeholder="Brief description of this project..."
                rows={3}
                className={input + " resize-none"}
              />
            </div>

            {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200/60 dark:border-white/8 bg-slate-50/50 dark:bg-white/2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white transition-all glass-btn-primary">
              <Plus size={12} />
              Add Project
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
