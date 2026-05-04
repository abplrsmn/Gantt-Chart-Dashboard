"use client";

import { useEffect, useRef, useState } from "react";
import {
  addMonths, subMonths, format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay,
  isWithinInterval, isValid, parseISO, setMonth as dfSetMonth,
  setYear as dfSetYear,
} from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight, X } from "lucide-react";

export type DateRange = { start: string; end: string };

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const DAYS        = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEAR_RANGE  = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 3 + i);

type HeaderMode = "calendar" | "month" | "year";

function buildDays(month: Date): Date[] {
  const s = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const e = endOfWeek(endOfMonth(month),     { weekStartsOn: 1 });
  const days: Date[] = [];
  let d = s;
  while (d <= e) { days.push(d); d = addDays(d, 1); }
  return days;
}

export default function DateRangePicker({ value, onChange }: Props) {
  const [open, setOpen]       = useState(false);
  // Draft state — only pushed to parent on Apply
  const [draft, setDraft]     = useState<DateRange>(value);
  const [activeField, setActiveField] = useState<"start"|"end">("start");
  const [hoverDate, setHoverDate]     = useState<Date | null>(null);
  const [leftMonth, setLeftMonth]     = useState<Date>(() => startOfMonth(new Date()));
  const [rightMonth, setRightMonth]   = useState<Date>(() => addMonths(startOfMonth(new Date()), 1));
  const [leftMode,  setLeftMode]  = useState<HeaderMode>("calendar");
  const [rightMode, setRightMode] = useState<HeaderMode>("calendar");

  // Parse from committed value (for trigger label)
  const committedStart = value.start && isValid(parseISO(value.start)) ? parseISO(value.start) : null;
  const committedEnd   = value.end   && isValid(parseISO(value.end))   ? parseISO(value.end)   : null;

  // Parse from draft (for calendar rendering)
  const draftStart = draft.start && isValid(parseISO(draft.start)) ? parseISO(draft.start) : null;
  const draftEnd   = draft.end   && isValid(parseISO(draft.end))   ? parseISO(draft.end)   : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dropDir, setDropDir] = useState<"down"|"up">("down");

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

  const handleOpen = () => {
    if (!open) {
      // Sync draft from committed value
      setDraft(value);
      setActiveField(committedStart && committedEnd ? "start" : "start");
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDropDir(rect.bottom + 500 > window.innerHeight ? "up" : "down");
      }
      if (committedStart) {
        setLeftMonth(startOfMonth(committedStart));
        // If end is set → right panel shows end's month; otherwise default to start+1
        setRightMonth(committedEnd ? startOfMonth(committedEnd) : addMonths(startOfMonth(committedStart), 1));
      }
    }
    setLeftMode("calendar");
    setRightMode("calendar");
    setOpen(o => !o);
  };

  const handleDayClick = (day: Date) => {
    const formatted = format(day, "yyyy-MM-dd");
    if (activeField === "start") {
      setDraft(d => ({ ...d, start: formatted }));
      // Sync right panel to the month after the selected start date
      setRightMonth(addMonths(startOfMonth(day), 1));
      // Auto-move to end ONLY if end is not set yet
      if (!draftEnd) setActiveField("end");
    } else {
      // If clicking before start, swap
      if (draftStart && day < draftStart) {
        setDraft({ start: formatted, end: draft.start });
      } else {
        setDraft(d => ({ ...d, end: formatted }));
      }
      // Stay on end — user can keep adjusting
    }
  };

  const handleApply = () => {
    onChange(draft);
    setOpen(false);
  };

  const handleClear = () => {
    setDraft({ start: "", end: "" });
  };

  const handleCancel = () => {
    setDraft(value); // revert to committed
    setOpen(false);
  };

  const isInRange = (d: Date) => {
    const effEnd = activeField === "end" && hoverDate && draftStart
      ? (hoverDate >= draftStart ? hoverDate : draftStart)
      : draftEnd;
    if (!draftStart || !effEnd) return false;
    const lo = draftStart <= effEnd ? draftStart : effEnd;
    const hi = draftStart <= effEnd ? effEnd : draftStart;
    return isWithinInterval(d, { start: lo, end: hi });
  };

  const today = new Date();

  const labelText = committedStart && committedEnd
    ? `${format(committedStart,"dd MMM yyyy")} → ${format(committedEnd,"dd MMM yyyy")}`
    : committedStart
      ? `${format(committedStart,"dd MMM yyyy")} → …`
      : "Pick a date";

  // ── Month Grid ──────────────────────────────────────────────────────────────
  const MonthGrid = ({ m }: { m: Date }) => {
    const days = buildDays(m);
    return (
      <div className="flex-1 min-w-0">
        <div className="grid grid-cols-7">
          {DAYS.map(d => (
            <div key={d} className="text-center text-[9px] font-semibold text-white/25 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const inMon = isSameMonth(day, m);
            const isS   = draftStart ? isSameDay(day, draftStart) : false;
            const isE   = draftEnd   ? isSameDay(day, draftEnd)   : false;
            const inR   = isInRange(day);
            const isTod = isSameDay(day, today);
            const isHov = hoverDate ? isSameDay(day, hoverDate) : false;
            return (
              <div
                key={i}
                onMouseEnter={() => setHoverDate(day)}
                onMouseLeave={() => setHoverDate(null)}
                onClick={() => inMon && handleDayClick(day)}
                className={`
                  h-8 flex items-center justify-center select-none
                  ${!inMon ? "opacity-10" : "cursor-pointer"}
                  ${inR && !isS && !isE ? "bg-cyan-500/12" : ""}
                  ${isS && !isE ? "rounded-l-full" : ""}
                  ${isE && !isS ? "rounded-r-full" : ""}
                  ${isS && isE  ? "rounded-full"   : ""}
                `}
              >
                <span className={`
                  w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-medium transition-all
                  ${isS || isE   ? "bg-cyan-500 text-white font-bold shadow-md shadow-cyan-500/40"
                  : isHov && inMon ? "bg-white/12 text-white"
                  : inR           ? "text-cyan-300"
                  : isTod         ? "ring-1 ring-cyan-400/70 text-cyan-400"
                  : inMon         ? "text-white/65 hover:bg-white/8 hover:text-white"
                  :                 "text-white/20"}
                `}>
                  {format(day,"d")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Month/Year Picker ───────────────────────────────────────────────────────
  const MonthPicker = ({ m, onPick, onClose }: { m: Date; onPick: (newM: Date) => void; onClose: () => void }) => (
    <div className="flex-1 min-w-0">
      <div className="grid grid-cols-4 gap-1.5 py-1">
        {MONTH_NAMES.map((name, idx) => {
          const active = m.getMonth() === idx;
          return (
            <button key={name} onClick={() => { onPick(dfSetMonth(m, idx)); onClose(); }}
              className={`py-2 rounded-lg text-[11px] font-semibold transition-all ${
                active ? "bg-cyan-500 text-white" : "text-white/60 hover:bg-white/8 hover:text-white"
              }`}>{name}</button>
          );
        })}
      </div>
    </div>
  );

  const YearPicker = ({ m, onPick, onClose }: { m: Date; onPick: (newM: Date) => void; onClose: () => void }) => (
    <div className="flex-1 min-w-0">
      <div className="grid grid-cols-3 gap-1.5 py-1">
        {YEAR_RANGE.map(yr => {
          const active = m.getFullYear() === yr;
          return (
            <button key={yr} onClick={() => { onPick(dfSetYear(m, yr)); onClose(); }}
              className={`py-2 rounded-lg text-[11px] font-semibold transition-all ${
                active ? "bg-cyan-500 text-white" : "text-white/60 hover:bg-white/8 hover:text-white"
              }`}>{yr}</button>
          );
        })}
      </div>
    </div>
  );

  const CalHeader = ({ m, mode, setMode }: {
    m: Date; mode: HeaderMode; setMode: (m: HeaderMode) => void;
  }) => (
    <div className="flex items-center justify-center gap-1 mb-3">
      <button onClick={() => setMode(mode === "month" ? "calendar" : "month")}
        className={`text-[12px] font-bold px-2 py-0.5 rounded-lg transition-all ${
          mode === "month" ? "bg-cyan-500/20 text-cyan-400" : "text-white/80 hover:bg-white/8 hover:text-white"
        }`}>{format(m, "MMM")}</button>
      <button onClick={() => setMode(mode === "year" ? "calendar" : "year")}
        className={`text-[12px] font-bold px-2 py-0.5 rounded-lg transition-all ${
          mode === "year" ? "bg-cyan-500/20 text-cyan-400" : "text-white/80 hover:bg-white/8 hover:text-white"
        }`}>{format(m, "yyyy")}</button>
    </div>
  );

  // Draft changed indicator
  const isDirty = draft.start !== value.start || draft.end !== value.end;

  return (
    <div ref={containerRef} className="relative">

      {/* ── Trigger ── */}
      <button
        onClick={handleOpen}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all whitespace-nowrap ${
          open
            ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-400"
            : "border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 text-slate-600 dark:text-slate-300 hover:border-cyan-400/50"
        }`}
      >
        <CalendarRange size={14} className={open ? "text-cyan-400" : "text-slate-400"} />
        <span className="text-[12px] font-medium">{labelText}</span>
        {(committedStart || committedEnd) && (
          <span
            className="ml-1 text-slate-300 dark:text-slate-600 hover:text-rose-400 transition-colors"
            onClick={e => { e.stopPropagation(); onChange({ start:"", end:"" }); }}
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className="absolute left-0 z-50 rounded-2xl border border-white/8 shadow-2xl"
          style={{
            ...(dropDir === "down" ? { top:"calc(100% + 8px)" } : { bottom:"calc(100% + 8px)" }),
            backgroundColor: "rgba(11,15,26,0.98)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)",
            animation: "calIn 0.2s cubic-bezier(0.34,1.4,0.64,1) forwards",
            width: "480px",
            maxWidth: "calc(100vw - 32px)",
          }}
        >
          {/* ── Form fields ── */}
          <div className="px-4 pt-4 pb-3 border-b border-white/6">
            <div className="flex items-center gap-3">
              <div
                onClick={() => setActiveField("start")}
                className={`flex-1 rounded-xl border px-3 py-2 cursor-pointer transition-all ${
                  activeField === "start"
                    ? "border-cyan-500/60 bg-cyan-500/8 ring-1 ring-cyan-500/20"
                    : "border-white/10 bg-white/4 hover:border-white/20"
                }`}
              >
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-0.5">Start Date</p>
                <p className={`text-[12px] font-semibold ${draftStart ? "text-white" : "text-white/25"}`}>
                  {draftStart ? format(draftStart,"dd MMMM yyyy") : "Click to select…"}
                </p>
              </div>
              <span className="text-white/20 text-sm shrink-0">→</span>
              <div
                onClick={() => setActiveField("end")}
                className={`flex-1 rounded-xl border px-3 py-2 cursor-pointer transition-all ${
                  activeField === "end"
                    ? "border-cyan-500/60 bg-cyan-500/8 ring-1 ring-cyan-500/20"
                    : "border-white/10 bg-white/4 hover:border-white/20"
                }`}
              >
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/40 mb-0.5">End Date</p>
                <p className={`text-[12px] font-semibold ${draftEnd ? "text-white" : "text-white/25"}`}>
                  {draftEnd ? format(draftEnd,"dd MMMM yyyy") : "Click to select…"}
                </p>
              </div>
            </div>
          </div>

          {/* ── Calendar area ── */}
          <div className="px-4 py-4">
            <div className="flex items-start gap-3">
              <button onClick={() => { setLeftMonth(m => subMonths(m,1)); setLeftMode("calendar"); }}
                className="w-7 h-7 mt-7 flex items-center justify-center rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors shrink-0">
                <ChevronLeft size={14} />
              </button>

              <div className="flex-1 min-w-0">
                <CalHeader m={leftMonth} mode={leftMode} setMode={setLeftMode} />
                {leftMode === "calendar" && <MonthGrid m={leftMonth} />}
                {leftMode === "month" && <MonthPicker m={leftMonth} onPick={m => setLeftMonth(startOfMonth(m))} onClose={() => setLeftMode("calendar")} />}
                {leftMode === "year"  && <YearPicker m={leftMonth} onPick={m => setLeftMonth(startOfMonth(m))} onClose={() => setLeftMode("calendar")} />}
              </div>

              <div className="w-px bg-white/6 self-stretch mx-1" />

              <div className="flex-1 min-w-0">
                <CalHeader m={rightMonth} mode={rightMode} setMode={setRightMode} />
                {rightMode === "calendar" && <MonthGrid m={rightMonth} />}
                {rightMode === "month" && <MonthPicker m={rightMonth} onPick={m => setRightMonth(startOfMonth(m))} onClose={() => setRightMode("calendar")} />}
                {rightMode === "year"  && <YearPicker m={rightMonth} onPick={m => setRightMonth(startOfMonth(m))} onClose={() => setRightMode("calendar")} />}
              </div>

              <button onClick={() => { setRightMonth(m => addMonths(m,1)); setRightMode("calendar"); }}
                className="w-7 h-7 mt-7 flex items-center justify-center rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors shrink-0">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>

          {/* ── Footer ── */}
          <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-white/6">
            <button onClick={handleClear}
              className="text-[11px] font-semibold text-white/30 hover:text-rose-400 hover:bg-white/5 px-2 py-1 rounded-lg transition-colors">
              Clear
            </button>
            <div className="flex gap-2">
              <button onClick={handleCancel}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white/50 hover:text-white hover:bg-white/8 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!draftStart || !draftEnd}
                className={`px-4 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                  isDirty
                    ? "bg-cyan-500 text-white hover:bg-cyan-400 shadow-sm shadow-cyan-500/30 animate-pulse"
                    : "bg-cyan-500 text-white hover:bg-cyan-400 shadow-sm shadow-cyan-500/30"
                }`}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes calIn {
          from { opacity:0; transform:translateY(-8px) scale(0.97); }
          to   { opacity:1; transform:translateY(0)   scale(1);    }
        }
      `}</style>
    </div>
  );
}
