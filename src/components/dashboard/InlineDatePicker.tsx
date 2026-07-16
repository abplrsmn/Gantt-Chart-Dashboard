"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addMonths, subMonths, format, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO, isValid,
  setMonth as dfSetMonth, setYear as dfSetYear,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  /** Anchor element the panel is positioned against (the field being edited). */
  anchorEl: HTMLElement | null;
  /** ISO date value e.g. "2026-07-16", or empty string / null for no value. */
  value: string | null;
  min?: string;
  max?: string;
  onPick: (value: string) => void;
  onClear: () => void;
  onCancel: () => void;
}

const DAYS        = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const YEAR_RANGE  = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i);

type HeaderMode = "calendar" | "month" | "year";

const PANEL_W = 300;
const PANEL_H = 380;

function parseVal(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? d : null;
}

// Rows of 7 days covering the displayed month (weeks start Monday)
function buildDayRows(month: Date): Date[][] {
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

export default function InlineDatePicker({ anchorEl, value, min, max, onPick, onClear, onCancel }: Props) {
  const selected = parseVal(value);
  const minD = parseVal(min);
  const maxD = parseVal(max);

  const [month, setMonth] = useState<Date>(() => startOfMonth(selected ?? new Date()));
  const [mode, setMode]   = useState<HeaderMode>("calendar");
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [isDark, setIsDark]     = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    let top  = rect.bottom + 6;
    let left = rect.left;
    if (left + PANEL_W > window.innerWidth - 16) left = window.innerWidth - PANEL_W - 16;
    if (top + PANEL_H > window.innerHeight - 16) top = rect.top - PANEL_H - 6;
    setPanelPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [anchorEl]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorEl?.contains(t)) return;
      if (!panelRef.current?.contains(t)) onCancel();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", key);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDisabled = (day: Date) => Boolean((minD && day < minD) || (maxD && day > maxD));

  const rows = buildDayRows(month);
  const today = new Date();
  const selKey = selected ? format(selected, "yyyy-MM-dd") : null;

  const panelBg = isDark ? "rgba(11,15,26,0.98)" : "rgba(255,255,255,0.98)";
  const panelShadow = isDark
    ? "0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.05)"
    : "0 24px 64px rgba(15,23,42,0.15), 0 0 0 1px rgba(15,23,42,0.08)";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-9999 rounded-xl border border-slate-200/80 dark:border-white/8 shadow-2xl animate-dropdown-enter"
      style={{
        top: panelPos.top, left: panelPos.left,
        width: PANEL_W, maxWidth: "calc(100vw - 32px)",
        backgroundColor: panelBg, backdropFilter: "blur(24px)", boxShadow: panelShadow,
      }}
    >
      {/* ── Header: nav + month/year ── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <button aria-label="Previous month" onClick={() => { setMonth(m => subMonths(m, 1)); setMode("calendar"); }}
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
          <button aria-label="Next month" onClick={() => { setMonth(m => addMonths(m, 1)); setMode("calendar"); }}
            className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/8 text-slate-400 dark:text-white/40 hover:text-slate-800 dark:hover:text-white transition-colors">
            <ChevronRight size={13} />
          </button>
        </div>

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

        {mode === "calendar" && (
          <>
            <div className="grid grid-cols-7 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[9px] font-semibold text-slate-400 dark:text-white/25 py-1">{d}</div>
              ))}
            </div>
            <div className="space-y-0.5">
              {rows.map((week, ri) => (
                <div key={ri} className="grid grid-cols-7">
                  {week.map((day, di) => {
                    const inMon    = isSameMonth(day, month);
                    const isTod    = isSameDay(day, today);
                    const isSel    = selKey === format(day, "yyyy-MM-dd");
                    const disabled = isDisabled(day);
                    return (
                      <div key={di} className="h-8 flex items-center justify-center">
                        <button
                          disabled={disabled}
                          onClick={() => onPick(format(day, "yyyy-MM-dd"))}
                          className={`w-7 h-7 flex items-center justify-center rounded-full text-[11px] font-medium transition-colors ${
                            disabled
                              ? "text-slate-200 dark:text-white/10 cursor-not-allowed"
                              : isSel
                                ? "bg-brand-sienna text-white font-semibold shadow-sm"
                                : isTod
                                  ? "ring-1 ring-brand-sienna/70 text-brand-sienna"
                                  : inMon
                                    ? "text-slate-600 dark:text-white/65 hover:bg-brand-sienna/10 hover:text-brand-sienna"
                                    : "text-slate-300 dark:text-white/20 hover:bg-brand-sienna/10"
                          }`}
                        >
                          {format(day, "d")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="px-4 pb-4 pt-2 flex items-center justify-between border-t border-slate-200 dark:border-white/6">
        <button onClick={onClear}
          className="text-[11px] font-bold text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70 px-2.5 py-1.5 rounded-lg transition-colors">
          Clear
        </button>
        <button
          disabled={isDisabled(today)}
          onClick={() => { setMonth(startOfMonth(today)); onPick(format(today, "yyyy-MM-dd")); }}
          className="text-[11px] font-bold text-brand-sienna hover:bg-brand-sienna/10 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
          Today
        </button>
      </div>
    </div>,
    document.body
  );
}
