"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths, subMonths, format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay,
  getISOWeek, getISOWeekYear, startOfISOWeek,
  setMonth as dfSetMonth, setYear as dfSetYear,
} from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  /** ISO week value e.g. "2026-W29" */
  value: string;
  onChange: (val: string) => void;
}

const DAYS        = ["Mo","Tu","We","Th","Fr","Sa","Su"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const YEAR_RANGE  = Array.from({ length: 8 }, (_, i) => 2024 + i);

type HeaderMode = "calendar" | "month" | "year";

const PANEL_W = 340;
const PANEL_H = 420;

function toWeekValue(date: Date): string {
  return `${getISOWeekYear(date)}-W${String(getISOWeek(date)).padStart(2, "0")}`;
}

function weekValueToMonday(val: string): Date | null {
  const m = val.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  const jan4 = new Date(year, 0, 4);
  const jan4dow = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4dow - 1) + (week - 1) * 7);
  return monday;
}

// Rows of 7 days covering the displayed month (weeks start Monday)
function buildWeekRows(month: Date): Date[][] {
  const s = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const e = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const rows: Date[][] = [];
  let d = s;
  while (d <= e) {
    rows.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    d = addDays(d, 7);
  }
  return rows;
}

export default function WeekPicker({ value, onChange }: Props) {
  const [open, setOpen]         = useState(false);
  const [month, setMonth]       = useState<Date>(() => startOfMonth(new Date()));
  const [mode, setMode]         = useState<HeaderMode>("calendar");
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [isDark, setIsDark]     = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef     = useRef<HTMLDivElement>(null);

  const selectedMonday = weekValueToMonday(value);

  // Track theme via html.dark class
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Close on outside click (panel is portaled to body, so check both refs)
  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!containerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        setOpen(false);
        setMode("calendar");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const calcPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let top  = rect.bottom + 8;
    // Right-align the panel to the trigger so it never runs off the right edge.
    let left = rect.right - PANEL_W;
    if (left < 8) left = rect.left;
    if (left + PANEL_W > window.innerWidth - 16) left = window.innerWidth - PANEL_W - 16;
    if (top + PANEL_H > window.innerHeight - 16) top = rect.top - PANEL_H - 8;
    setPanelPos({ top: Math.max(8, top), left: Math.max(8, left) });
  };

  const handleOpen = () => {
    if (!open) {
      setMode("calendar");
      calcPosition();
      setMonth(startOfMonth(selectedMonday ?? new Date()));
    }
    setOpen(o => !o);
  };

  const selectWeek = (day: Date) => {
    onChange(toWeekValue(day));
    setOpen(false);
    setMode("calendar");
  };

  const handleThisWeek = () => {
    const now = new Date();
    onChange(toWeekValue(now));
    setMonth(startOfMonth(now));
    setOpen(false);
    setMode("calendar");
  };

  const today   = new Date();
  const rows    = buildWeekRows(month);
  const selKey  = selectedMonday ? format(startOfISOWeek(selectedMonday), "yyyy-MM-dd") : null;

  const labelText = selectedMonday
    ? `Week ${getISOWeek(selectedMonday)}, ${getISOWeekYear(selectedMonday)}`
    : "Pick a week";

  const panelBg = isDark ? "rgba(11,15,26,0.98)" : "rgba(255,255,255,0.98)";
  const panelShadow = isDark
    ? "0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)"
    : "0 24px 64px rgba(15,23,42,0.15), 0 0 0 1px rgba(15,23,42,0.08)";

  return (
    <div ref={containerRef} className="relative">

      {/* ── Trigger ── */}
      <button
        onClick={handleOpen}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all whitespace-nowrap ${
          open
            ? "border-brand-sienna/60 bg-brand-sienna/10 text-brand-sienna"
            : "border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:bg-white dark:hover:bg-zinc-900/80"
        }`}
      >
        <CalendarRange size={14} className={open ? "text-brand-sienna" : "text-slate-400"} />
        <span className="text-[12px] font-medium">{labelText}</span>
      </button>

      {/* ── Panel — portaled to body, fixed position, matches DateRangePicker animation ── */}
      {typeof document !== "undefined" && createPortal(
      <div
        ref={panelRef}
        className="fixed z-9999 rounded-xl border border-slate-200/80 dark:border-white/8 shadow-2xl"
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
        {/* ── Header: nav + month/year ── */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => { setMonth(m => subMonths(m, 1)); setMode("calendar"); }}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-slate-400 dark:text-white/40 hover:text-slate-800 dark:hover:text-white transition-colors">
              <ChevronLeft size={13} />
            </button>
            <div className="flex items-center gap-1">
              <button onClick={() => setMode(mode === "month" ? "calendar" : "month")}
                className={`text-[12px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
                  mode === "month"
                    ? "bg-brand-sienna/20 text-brand-sienna"
                    : "text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-900 dark:hover:text-white"
                }`}>{format(month, "MMMM")}</button>
              <button onClick={() => setMode(mode === "year" ? "calendar" : "year")}
                className={`text-[12px] font-bold px-2 py-0.5 rounded-lg transition-colors ${
                  mode === "year"
                    ? "bg-brand-sienna/20 text-brand-sienna"
                    : "text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-900 dark:hover:text-white"
                }`}>{format(month, "yyyy")}</button>
            </div>
            <button onClick={() => { setMonth(m => addMonths(m, 1)); setMode("calendar"); }}
              className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-slate-400 dark:text-white/40 hover:text-slate-800 dark:hover:text-white transition-colors">
              <ChevronRight size={13} />
            </button>
          </div>

          {/* ── Month / Year quick pick ── */}
          {mode === "month" && (
            <div className="grid grid-cols-4 gap-1.5 py-1">
              {MONTH_NAMES.map((name, idx) => (
                <button key={name}
                  onClick={() => { setMonth(m => startOfMonth(dfSetMonth(m, idx))); setMode("calendar"); }}
                  className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                    month.getMonth() === idx
                      ? "bg-brand-sienna text-white"
                      : "text-slate-500 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >{name}</button>
              ))}
            </div>
          )}
          {mode === "year" && (
            <div className="grid grid-cols-4 gap-1.5 py-1">
              {YEAR_RANGE.map(yr => (
                <button key={yr}
                  onClick={() => { setMonth(m => startOfMonth(dfSetYear(m, yr))); setMode("calendar"); }}
                  className={`py-2 rounded-lg text-[11px] font-semibold transition-colors ${
                    month.getFullYear() === yr
                      ? "bg-brand-sienna text-white"
                      : "text-slate-500 dark:text-white/60 hover:bg-slate-100 dark:hover:bg-white/8 hover:text-slate-800 dark:hover:text-white"
                  }`}
                >{yr}</button>
              ))}
            </div>
          )}

          {/* ── Calendar: click a row to pick that week ── */}
          {mode === "calendar" && (
            <>
              <div className="flex items-center gap-1 px-1 mb-1">
                <div className="w-8 text-center text-[9px] font-bold uppercase tracking-wide text-slate-300 dark:text-white/20">Wk</div>
                <div className="flex-1 grid grid-cols-7">
                  {DAYS.map(d => (
                    <div key={d} className="text-center text-[9px] font-semibold text-slate-400 dark:text-white/25 py-1">{d}</div>
                  ))}
                </div>
              </div>

              <div className="space-y-0.5">
                {rows.map((week, ri) => {
                  const monday   = week[0];
                  const rowKey   = format(monday, "yyyy-MM-dd");
                  const selected = selKey === rowKey;
                  const wkNum    = getISOWeek(monday);
                  return (
                    <div
                      key={ri}
                      onClick={() => selectWeek(monday)}
                      className={`group flex items-center gap-1 rounded-lg px-1 py-0.5 cursor-pointer transition-colors ${
                        selected ? "bg-brand-sienna" : "hover:bg-brand-sienna/10"
                      }`}
                      style={selected ? { boxShadow: "0 4px 10px rgba(155,107,71,0.35)" } : undefined}
                    >
                      <div className={`w-8 text-center text-[10px] font-bold ${
                        selected ? "text-white/80" : "text-slate-300 dark:text-white/25 group-hover:text-brand-sienna"
                      }`}>{wkNum}</div>
                      <div className="flex-1 grid grid-cols-7">
                        {week.map((day, di) => {
                          const inMon = isSameMonth(day, month);
                          const isTod = isSameDay(day, today);
                          return (
                            <div key={di} className="h-8 flex items-center justify-center">
                              <span className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                                selected
                                  ? "text-white font-semibold"
                                  : isTod
                                    ? "ring-1 ring-brand-sienna/70 text-brand-sienna"
                                    : inMon
                                      ? "text-slate-600 dark:text-white/65 group-hover:text-slate-900 dark:group-hover:text-white"
                                      : "text-slate-300 dark:text-white/20"
                              }`}>
                                {format(day, "d")}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-slate-200 dark:border-white/6">
          <span className="text-[11px] font-semibold text-slate-400 dark:text-white/40">
            {selectedMonday ? `${format(selectedMonday, "d MMM")} – ${format(addDays(selectedMonday, 6), "d MMM yyyy")}` : "—"}
          </span>
          <button onClick={handleThisWeek}
            className="text-[11px] font-bold text-brand-sienna hover:bg-brand-sienna/10 px-2.5 py-1.5 rounded-lg transition-colors">
            This Week
          </button>
        </div>
      </div>,
      document.body
      )}
    </div>
  );
}
