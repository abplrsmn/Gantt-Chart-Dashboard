"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Trash2, Calendar } from "lucide-react";
import AnimatedDropdown from "./AnimatedDropdown";

type Option = { id: number; code?: string; name: string; color?: string };
type Options = {
  phases:     Option[];
  priorities: Option[];
  units:      Option[];
};

const PHASE_DATE_LABELS: Record<string, { start: string; end: string }> = {
  operational_brief:  { start: "Brief Received",  end: "Brief Deadline"   },
  design:             { start: "Start Design",     end: "Design Approval"  },
  project_control:    { start: "Tender Start",     end: "SPK Released"     },
  project_management: { start: "Commence Date",    end: "End Contract"     },
  handover:           { start: "BAST 1",           end: "BAST 2"           },
};

type PhaseEntry = { phase_id: string; start: string; end: string };

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

function DateInput({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className="relative cursor-pointer"
      onClick={() => { ref.current?.showPicker?.(); ref.current?.focus(); }}
    >
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 pl-3 pr-10 py-2.5 text-[12px] text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 focus:ring-2 focus:ring-brand-sienna/15 transition-all cursor-pointer scheme-light dark:scheme-dark [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <Calendar size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-400 pointer-events-none" />
    </div>
  );
}

export default function AddProjectModal({
  onClose,
  onSuccess,
}: {
  onClose:   () => void;
  onSuccess: (projectName: string) => void;
}) {
  const [options,     setOptions]     = useState<Options | null>(null);
  const [form,        setForm]        = useState<FormState>(EMPTY);
  const [phaseDates,  setPhaseDates]  = useState<PhaseEntry[]>([]);
  const [addingPhase, setAddingPhase] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [exiting,     setExiting]     = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function closeWithAnimation() {
    setExiting(true);
    setTimeout(() => { setExiting(false); onClose(); }, 200);
  }

  useEffect(() => {
    fetch("/api/master/options")
      .then(r => r.json())
      .then(d => { if (d.success) setOptions({ phases: d.phases, priorities: d.priorities, units: d.units ?? [] }); })
      .catch(() => {});
    setTimeout(() => nameRef.current?.focus(), 80);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeWithAnimation(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  function set(key: keyof FormState, value: string) {
    if (key === "current_phase_id") {
      setForm(f => ({ ...f, current_phase_id: value, phase_start: "", phase_end: "" }));
      setError(null);
      return;
    }
    setForm(f => ({ ...f, [key]: value }));
    setError(null);
  }

  const selectedPhase   = options?.phases.find(p => String(p.id) === form.current_phase_id);
  const phaseDateLabels = selectedPhase?.code ? PHASE_DATE_LABELS[selectedPhase.code] : null;

  function addPhaseEntry() {
    setAddingPhase(true);
    setPhaseDates(prev => [...prev, { phase_id: "", start: "", end: "" }]);
    setAddingPhase(false);
  }

  function updatePhaseEntry(idx: number, field: keyof PhaseEntry, value: string) {
    setPhaseDates(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  }

  function removePhaseEntry(idx: number) {
    setPhaseDates(prev => prev.filter((_, i) => i !== idx));
  }

  // Phases not yet added
  const usedPhaseIds = new Set(phaseDates.map(e => e.phase_id));
  const availablePhases = options?.phases.filter(p => !usedPhaseIds.has(String(p.id))) ?? [];

  async function handleSubmit(e: { preventDefault(): void }) {
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

    // Use first phase entry as current_phase if no current_phase_id picked
    const effectiveCurrentPhase = form.current_phase_id ||
      (phaseDates[0]?.phase_id ?? "");

    // Current phase dates: prefer form.phase_start/end (from the inline date inputs),
    // fall back to a matching entry in phaseDates
    const matchingEntry = phaseDates.find(e => e.phase_id === effectiveCurrentPhase);
    const resolvedStart = form.phase_start || matchingEntry?.start || null;
    const resolvedEnd   = form.phase_end   || matchingEntry?.end   || null;

    onClose();
    fetch("/api/projects", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name:     form.project_name.trim(),
        unit_name:        form.unit_name.trim()       || null,
        priority_id:      form.priority_id             ? Number(form.priority_id)      : null,
        current_phase_id: effectiveCurrentPhase        ? Number(effectiveCurrentPhase) : null,
        phase_start:      resolvedStart,
        phase_end:        resolvedEnd,
        start_date:       form.start_date              || null,
        end_date:         form.end_date                || null,
        summary_brief:    form.summary_brief.trim()    || null,
        extra_phases:     phaseDates
          .filter(e => e.phase_id && e.phase_id !== String(effectiveCurrentPhase) && (e.start || e.end))
          .map(e => ({ phase_id: Number(e.phase_id), start: e.start || null, end: e.end || null })),
      }),
    })
      .then(r => r.json())
      .then(data => { if (data.success) onSuccess(data.data?.project_name ?? form.project_name.trim()); })
      .catch(() => {});
  }

  const lbl   = "text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1 block";
  const input = "w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white dark:bg-zinc-900/60 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-200 outline-none focus:border-brand-sienna/60 focus:ring-2 focus:ring-brand-sienna/15 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600";

  // Phase date constraints — restricted to the project's overall date range
  const phaseMin = form.start_date || undefined;
  const phaseMax = form.end_date   || undefined;

  return createPortal(
    <div
      className={`fixed inset-0 z-9998 flex items-center justify-center p-4 ${exiting ? "animate-backdrop-exit" : "animate-backdrop-enter"}`}
      style={{ backgroundColor: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)" }}
      onMouseDown={e => { if (e.target === e.currentTarget) closeWithAnimation(); }}
    >
      <div
        className={`relative w-full max-w-lg bg-white dark:bg-zinc-950 rounded-xl border border-slate-200/80 dark:border-white/8 overflow-hidden ${exiting ? "animate-modal-exit" : "animate-modal-enter"}`}
        style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200/60 dark:border-white/8">
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex-1">Add New Project</h2>
          <button type="button" onClick={closeWithAnimation}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4 max-h-[66vh] overflow-y-auto">

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
                <AnimatedDropdown
                  value={form.unit_name}
                  options={[{ value: "", label: "— Select unit" }, ...(options?.units.map(u => ({ value: u.name, label: u.name })) ?? [])]}
                  onChange={v => set("unit_name", v)}
                  placeholder="— Select unit"
                  className="w-full"
                />
              </div>
              <div>
                <label className={lbl}>Priority</label>
                <AnimatedDropdown
                  value={form.priority_id}
                  options={[{ value: "", label: "— Select priority" }, ...(options?.priorities.map(p => ({ value: String(p.id), label: p.name, color: p.color })) ?? [])]}
                  onChange={v => set("priority_id", v)}
                  placeholder="— Select priority"
                  className="w-full"
                />
              </div>
            </div>

            {/* Project Timeline — required */}
            <div>
              <p className={lbl}>
                Project Timeline <span className="text-rose-400 normal-case tracking-normal">*</span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 block">Start Date</label>
                  <DateInput value={form.start_date} onChange={v => set("start_date", v)} max={form.end_date || undefined} />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 block">End Date</label>
                  <DateInput value={form.end_date} onChange={v => set("end_date", v)} min={form.start_date || undefined} />
                </div>
              </div>
            </div>

            {/* Current Phase + its dates */}
            <div>
              <label className={lbl}>Current Phase</label>
              <AnimatedDropdown
                value={form.current_phase_id}
                options={[{ value: "", label: "— Select current phase" }, ...(options?.phases.map(p => ({ value: String(p.id), label: p.name })) ?? [])]}
                onChange={v => set("current_phase_id", v)}
                placeholder="— Select current phase"
                className="w-full"
              />
              {phaseDateLabels && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">{phaseDateLabels.start}</label>
                    <DateInput value={form.phase_start} onChange={v => set("phase_start", v)} min={phaseMin} max={phaseMax} />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 mb-1 block">{phaseDateLabels.end}</label>
                    <DateInput value={form.phase_end} onChange={v => set("phase_end", v)} min={phaseMin} max={phaseMax} />
                  </div>
                </div>
              )}
            </div>

            {/* Phase Dates — multiple */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className={lbl + " mb-0"}>Phase Dates <span className="normal-case tracking-normal text-slate-300">(optional)</span></p>
                {availablePhases.length > 0 && (
                  <button
                    type="button"
                    onClick={addPhaseEntry}
                    disabled={addingPhase}
                    className="flex items-center gap-1 text-[10px] font-semibold text-brand-sienna hover:text-brand-mahogany transition-colors"
                  >
                    <Plus size={10} />
                    Add Phase
                  </button>
                )}
              </div>

              {phaseDates.length === 0 ? (
                <p className="text-[11px] italic text-slate-300 dark:text-slate-600">No phase dates added yet.</p>
              ) : (
                <div className="space-y-2">
                  {phaseDates.map((entry, idx) => {
                    const phase = options?.phases.find(p => String(p.id) === entry.phase_id);
                    const labels = phase?.code ? PHASE_DATE_LABELS[phase.code] : null;
                    const phaseOptions = options?.phases.filter(p =>
                      !usedPhaseIds.has(String(p.id)) || String(p.id) === entry.phase_id
                    ) ?? [];
                    return (
                      <div key={idx} className="rounded-lg border border-slate-200/70 dark:border-white/8 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-white/3 border-b border-slate-200/60 dark:border-white/6">
                          <AnimatedDropdown
                            value={entry.phase_id}
                            options={[{ value: "", label: "— Select phase" }, ...phaseOptions.map(p => ({ value: String(p.id), label: p.name }))]}
                            onChange={v => updatePhaseEntry(idx, "phase_id", v)}
                            placeholder="— Select phase"
                            className="flex-1"
                          />
                          <button type="button" onClick={() => removePhaseEntry(idx)} className="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 p-3">
                          <div>
                            <label className="text-[10px] text-slate-400 mb-1 block">{labels?.start ?? "Start"}</label>
                            <input type="date" value={entry.start} min={phaseMin} max={phaseMax} onChange={e => updatePhaseEntry(idx, "start", e.target.value)} className={input} />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 mb-1 block">{labels?.end ?? "End"}</label>
                            <input type="date" value={entry.end} min={phaseMin} max={phaseMax} onChange={e => updatePhaseEntry(idx, "end", e.target.value)} className={input} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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
            <button type="button" onClick={closeWithAnimation}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all glass-btn-primary">
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
