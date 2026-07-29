"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMonths, subMonths, format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay,
  isWithinInterval, isValid, parseISO,
  setMonth as dfSetMonth, setYear as dfSetYear,
} from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";

export type DateRange = { start: string; end: string };

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const DAYS        = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEAR_RANGE  = Array.from({ length: 8 }, (_, i) => 2024 + i);

type HeaderMode = "calendar" | "month" | "year";
type Step = "start" | "end";

function buildDays(month: Date): Date[] {
  const s = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const e = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = s;
  while (d <= e) { days.push(d); d = addDays(d, 1); }
  return days;
}

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
}

const PANEL_W = 500;
const PANEL_H = 560;

export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen]             = useState(false);
  const [draft, setDraft]           = useState<DateRange>(value);
  const [step, setStep]             = useState<Step>("start");
  const [leftMonth, setLeftMonth]   = useState<Date>(() => startOfMonth(new Date()));
  const [rightMonth, setRightMonth] = useState<Date>(() => addMonths(startOfMonth(new Date()), 1));
  const [leftMode, setLeftMode]     = useState<HeaderMode>("calendar");
  const [rightMode, setRightMode]   = useState<HeaderMode>("calendar");
  const [panelPos, setPanelPos]     = useState({ top: 0, left: 0 });
  const [isDark, setIsDark]         = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const committedStart = parseDate(value.start);
  const committedEnd   = parseDate(value.end);
  const draftStart     = parseDate(draft.start);
  const draftEnd       = parseDate(draft.end);

  // Track theme via html.dark class
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setLeftMode("calendar");
        setRightMode("calendar");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const calcPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let top  = rect.bottom + 8;
    let left = rect.right - PANEL_W;
    if (left < 8) left = rect.left;
    if (left + PANEL_W > window.innerWidth - 16) left = window.innerWidth - PANEL_W - 16;
    if (top + PANEL_H > window.innerHeight - 16) top = rect.top - PANEL_H - 8;
    setPanelPos({ top: Math.max(8, top), left: Math.max(8, left) });
  };

  const handleOpen = () => {
    if (!open) {
      setDraft(value);
      setStep("start");
      setLeftMode("calendar");
      setRightMode("calendar");
      calcPosition();
      if (committedStart) {
        setLeftMonth(startOfMonth(committedStart));
        setRightMonth(committedEnd ? startOfMonth(committedEnd) : addMonths(startOfMonth(committedStart), 1));
      } else {
        setLeftMonth(startOfMonth(new Date()));
        setRightMonth(addMonths(startOfMonth(new Date()), 1));
      }
    }
    setOpen(o => !o);
  };

  const handleDayClick = (day: Date) => {
    const formatted = format(day, "yyyy-MM-dd");
    if (step === "start") {
      setDraft({ start: formatted, end: "" });
      setRightMonth(addMonths(startOfMonth(day), 1));
      setStep("end");
    } else {
      if (draftStart && day < draftStart) {
        setDraft({ start: formatted, end: draft.start });
      } else {
        setDraft(d => ({ ...d, end: formatted }));
      }
    }
  };

  const handleToday = () => {
    const t = format(new Date(), "yyyy-MM-dd");
    setDraft({ start: t, end: t });
    setStep("end");
  };

  const handleThisWeek = () => {
    const s = startOfWeek(new Date(), { weekStartsOn: 1 });
    const e = endOfWeek(new Date(), { weekStartsOn: 1 });
    setDraft({ start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") });
    setStep("end");
  };

  const handleThisMonth = () => {
    const s = startOfMonth(new Date());
    const e = endOfMonth(new Date());
    setDraft({ start: format(s, "yyyy-MM-dd"), end: format(e, "yyyy-MM-dd") });
    setStep("end");
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft({ start: "", end: "" });
    setStep("start");
  };

  const handleCancel = () => {
    setDraft(value);
    setOpen(false);
  };

  const isInRange = (d: Date): boolean => {
    if (!draftStart || !draftEnd) return false;
    const lo = draftStart <= draftEnd ? draftStart : draftEnd;
    const hi = draftStart <= draftEnd ? draftEnd   : draftStart;
    return isWithinInterval(d, { start: lo, end: hi });
  };

  const today    = new Date();
  const isDirty  = draft.start !== value.start || draft.end !== value.end;

  const labelText = committedStart && committedEnd
    ? `${format(committedStart, "dd MMM yyyy")} → ${format(committedEnd, "dd MMM yyyy")}`
    : committedStart
      ? `${format(committedStart, "dd MMM yyyy")} → …`
      : "Pick a date range";

  const panelBg  = isDark ? "rgba(11,15,26,0.98)" : "rgba(255,255,255,0.98)";
  const panelShadow = isDark
    ? "0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)"
    : "0 24px 64px rgba(15,23,42,0.15), 0 0 0 1px rgba(15,23,42,0.08)";

  // ── Sub-components ────────────────────────────────────────────────────────
  const MonthGrid = ({ m }: { m: Date }) => {
    const days = buildDays(m);
    return (
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-7">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[9px] font-semibold text-slate-400 dark:text-white/25 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const inMon   = isSameMonth(day, m);
            const isS     = draftStart ? isSameDay(day, draftStart) : false;
            const isE     = draftEnd   ? isSameDay(day, draftEnd)   : false;
            const inR     = isInRange(day);
            const isTod   = isSameDay(day, today);
            const disabled = !inMon || (step === "end" && !draftStart);
            return (
              <div
                key={i}
                onClick={() => !disabled && handleDayClick(day)}
                className={`
                  h-8 flex items-center justify-center select-none
                  ${disabled ? "opacity-10" : "cursor-pointer"}
                  ${inR && !isS && !isE ? "bg-brand-sienna/12" : ""}
                  ${isS && isE ? "" : isS ? "rounded-l-full" : isE ? "rounded-r-full" : ""}
                `}
              >
                <span className={`
                  w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-medium transition-colors
                  ${isS || isE   ? "bg-brand-sienna text-white font-bold"
                  : inR          ? "text-brand-sienna dark:text-brand-sand"
                  : isTod        ? "ring-1 ring-brand-sienna/70 text-brand-sienna"
                  : inMon        ? "text-slate-600 dark:text-white/65 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white"
                  :                "text-slate-300 dark:text-white/20"}
                `}
                  style={isS || isE ? { boxShadow: "0 4px 8px rgba(16,185,129,0.42)" } : undefined}
                >
                  {format(day, "d")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const MonthPicker = ({ m, onPick, onClose }: { m: Date; onPick: (d: Date) => void; onClose: () => void }) => (
    <div className="flex-1 min-w-0">
      <div className="grid grid-cols-4 gap-1.5 py-1">
        {MONTH_NAMES.map((name, idx) => (
          <button key={name}
            onClick={() => { onPick(dfSetMonth(m, idx)); onClose(); }}
            className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${
              m.getMonth() === idx
                ? "bg-brand-sienna text-white"
                : "text-slate-500 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-800 dark:hover:text-white"
            }`}
          >{name}</button>
        ))}
      </div>
    </div>
  );

  const YearPicker = ({ m, onPick, onClose }: { m: Date; onPick: (d: Date) => void; onClose: () => void }) => (
    <div className="flex-1 min-w-0">
      <div className="grid grid-cols-4 gap-1.5 py-1">
        {YEAR_RANGE.map(yr => (
          <button key={yr}
            onClick={() => { onPick(dfSetYear(m, yr)); onClose(); }}
            className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${
              m.getFullYear() === yr
                ? "bg-brand-sienna text-white"
                : "text-slate-500 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-800 dark:hover:text-white"
            }`}
          >{yr}</button>
        ))}
      </div>
    </div>
  );

  const CalHeader = ({ m, mode, onNavPrev, onNavNext, setMode }: {
    m: Date; mode: HeaderMode; onNavPrev: () => void; onNavNext: () => void; setMode: (m: HeaderMode) => void;
  }) => (
    <div className="flex items-center justify-between mb-3">
      <button aria-label="Previous month" onClick={onNavPrev}
        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-slate-400 dark:text-white/40 hover:text-slate-800 dark:hover:text-white transition-colors">
        <ChevronLeft size={13} />
      </button>
      <div className="flex items-center gap-1">
        <button onClick={() => setMode(mode === "month" ? "calendar" : "month")}
          className={`text-[12px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
            mode === "month"
              ? "bg-brand-sienna/20 text-brand-sienna"
              : "text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-900 dark:hover:text-white"
          }`}>{format(m, "MMM")}</button>
        <button onClick={() => setMode(mode === "year" ? "calendar" : "year")}
          className={`text-[12px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
            mode === "year"
              ? "bg-brand-sienna/20 text-brand-sienna"
              : "text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-900 dark:hover:text-white"
          }`}>{format(m, "yyyy")}</button>
      </div>
      <button aria-label="Next month" onClick={onNavNext}
        className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-slate-400 dark:text-white/40 hover:text-slate-800 dark:hover:text-white transition-colors">
        <ChevronRight size={13} />
      </button>
    </div>
  );

  return (
    <div ref={containerRef} className="relative">

      {/* ── Trigger ── */}
      <button
        onClick={handleOpen}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm shadow-sm transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
          open
            ? "border-brand-sienna/60 bg-brand-sienna/10 text-brand-sienna shadow-sm shadow-emerald-500/10"
            : "border-slate-200 dark:border-white/10 bg-white/90 dark:bg-zinc-900/80 text-slate-600 dark:text-slate-300 hover:border-emerald-400/70 dark:hover:border-emerald-400/45 hover:shadow-sm hover:shadow-emerald-500/10"
        }`}
      >
        <CalendarRange size={14} className={open ? "text-brand-sienna" : "text-slate-400"} />
        <span className="text-[12px] font-medium">{labelText}</span>
        {(committedStart || committedEnd) && (
          <span
            className="ml-1 text-slate-400 dark:text-slate-600 hover:text-rose-400 transition-colors"
            onClick={e => { e.stopPropagation(); onChange({ start: "", end: "" }); }}
          >
            <X size={14} />
          </span>
        )}
      </button>

      {/* ── Panel — fixed position to avoid overflow ── */}
      <div
        className="fixed z-[9999] rounded-xl border border-slate-200/80 dark:border-white/8 shadow-2xl"
        style={{
          top:          panelPos.top,
          left:         panelPos.left,
          width:        PANEL_W,
          maxWidth:     "calc(100vw - 32px)",
          backgroundColor: panelBg,
          backdropFilter:  "blur(24px)",
          boxShadow:    panelShadow,
          opacity:      open ? 1 : 0,
          transform:    open ? "scale(1) translateY(0)" : "scale(0.97) translateY(-8px)",
          pointerEvents: open ? "auto" : "none",
          transition:   "opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* ── Step indicator + date fields ── */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-200 dark:border-white/6">
          <div className="flex items-center gap-3">
            {/* Start field — blocked when picking end date */}
            <div
              onClick={() => { if (step !== "end") { setStep("start"); setDraft(d => ({ ...d, end: "" })); } }}
              className={`flex-1 rounded-lg border px-3 py-2 transition-all ${
                step === "end"
                  ? "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/2 opacity-50 cursor-not-allowed"
                  : step === "start"
                    ? "border-brand-sienna/60 bg-brand-sienna/8 ring-1 ring-brand-sienna/20 cursor-pointer"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/4 hover:border-slate-300 dark:hover:border-white/20 cursor-pointer"
              }`}
            >
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-0.5">
                {step === "start" ? "① Pick start date" : "Start Date"}
              </p>
              <p className={`text-[12px] font-semibold ${draftStart ? "text-slate-800 dark:text-white" : "text-slate-300 dark:text-white/25"}`}>
                {draftStart ? format(draftStart, "dd MMMM yyyy") : "Click a day…"}
              </p>
            </div>

            <span className="text-slate-300 dark:text-white/20 text-sm shrink-0">→</span>

            {/* End field — inactive until start is picked */}
            <div
              onClick={() => { if (draftStart) setStep("end"); }}
              className={`flex-1 rounded-lg border px-3 py-2 transition-all ${
                !draftStart
                  ? "border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/2 opacity-40 cursor-not-allowed"
                  : step === "end"
                    ? "border-brand-sienna/60 bg-brand-sienna/8 ring-1 ring-brand-sienna/20 cursor-pointer"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/4 hover:border-slate-300 dark:hover:border-white/20 cursor-pointer"
              }`}
            >
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-0.5">
                {step === "end" && draftStart ? "② Pick end date" : "End Date"}
              </p>
              <p className={`text-[12px] font-semibold ${draftEnd ? "text-slate-800 dark:text-white" : "text-slate-300 dark:text-white/25"}`}>
                {draftEnd ? format(draftEnd, "dd MMMM yyyy") : draftStart ? "Click a day…" : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* ── Quick presets ── */}
        <div className="px-4 py-2 border-b border-slate-200 dark:border-white/6 flex items-center gap-1">
          <button onClick={handleToday}
            className="text-[11px] font-semibold text-slate-500 dark:text-white/50 hover:text-brand-sienna hover:bg-brand-sienna/10 px-2.5 py-1.5 rounded-lg transition-colors">
            Today
          </button>
          <button onClick={handleThisWeek}
            className="text-[11px] font-semibold text-slate-500 dark:text-white/50 hover:text-brand-sienna hover:bg-brand-sienna/10 px-2.5 py-1.5 rounded-lg transition-colors">
            This Week
          </button>
          <button onClick={handleThisMonth}
            className="text-[11px] font-semibold text-slate-500 dark:text-white/50 hover:text-brand-sienna hover:bg-brand-sienna/10 px-2.5 py-1.5 rounded-lg transition-colors">
            This Month
          </button>
        </div>

        {/* ── Calendars ── */}
        <div className="px-4 py-4">
          <div className="flex items-start gap-4">
            {/* Left calendar */}
            <div className="flex-1 min-w-0">
              <CalHeader
                m={leftMonth} mode={leftMode}
                onNavPrev={() => { setLeftMonth(m => subMonths(m, 1)); setLeftMode("calendar"); }}
                onNavNext={() => { setLeftMonth(m => addMonths(m, 1)); setLeftMode("calendar"); }}
                setMode={setLeftMode}
              />
              {leftMode === "calendar" && <MonthGrid m={leftMonth} />}
              {leftMode === "month"    && <MonthPicker m={leftMonth} onPick={m => setLeftMonth(startOfMonth(m))} onClose={() => setLeftMode("calendar")} />}
              {leftMode === "year"     && <YearPicker  m={leftMonth} onPick={m => setLeftMonth(startOfMonth(m))} onClose={() => setLeftMode("calendar")} />}
            </div>

            <div className="w-px bg-slate-200 dark:bg-white/6 self-stretch" />

            {/* Right calendar — disabled while picking start */}
            <div
              className="flex-1 min-w-0 transition-opacity duration-150"
              style={{ opacity: step === "start" ? 0.3 : 1, pointerEvents: step === "start" ? "none" : "auto" }}
            >
              <CalHeader
                m={rightMonth} mode={rightMode}
                onNavPrev={() => { setRightMonth(m => subMonths(m, 1)); setRightMode("calendar"); }}
                onNavNext={() => { setRightMonth(m => addMonths(m, 1)); setRightMode("calendar"); }}
                setMode={setRightMode}
              />
              {rightMode === "calendar" && <MonthGrid m={rightMonth} />}
              {rightMode === "month"    && <MonthPicker m={rightMonth} onPick={m => setRightMonth(startOfMonth(m))} onClose={() => setRightMode("calendar")} />}
              {rightMode === "year"     && <YearPicker  m={rightMonth} onPick={m => setRightMonth(startOfMonth(m))} onClose={() => setRightMode("calendar")} />}
            </div>
          </div>
        </div>

        {/* ── Footer: Clear | Cancel | Apply ── */}
        <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-slate-200 dark:border-white/6">
          <button onClick={handleClear}
            className="text-[11px] font-semibold text-slate-400 dark:text-white/30 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-white/5 px-2.5 py-1.5 rounded-lg transition-colors">
            Clear
          </button>
          <div className="flex gap-2">
            <button onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-slate-500 dark:text-white/50 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/8 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!draftStart || !draftEnd}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed
                bg-brand-sienna text-white hover:bg-brand-mahogany shadow-sm
                ${isDirty ? "ring-2 ring-brand-sienna/40" : ""}
              `}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
