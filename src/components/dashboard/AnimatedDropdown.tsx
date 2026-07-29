"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  color?: string;
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  minWidth?: number;
  disabled?: boolean;
  dropUp?: boolean;
}

export default function AnimatedDropdown({
  value, options, onChange, placeholder = "Select…",
  className = "", align = "left", minWidth = 160, disabled = false, dropUp = false,
}: Props) {
  const [open, setOpen]         = useState(false);
  // position: fixed + off-screen by default so the portal panel never sits in
  // normal document flow (which would inflate document.body's scroll height)
  // before it's ever been opened.
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({ position: "fixed", top: -9999, left: -9999 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  // Position the portal panel relative to the trigger
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r      = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const goUp   = dropUp || spaceBelow < 220 && spaceAbove > spaceBelow;
    const left   = align === "right" ? r.right - Math.max(minWidth, r.width) : r.left;
    setPanelStyle({
      position:  "fixed",
      left:      left,
      ...(goUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      minWidth:  Math.max(minWidth, r.width),
      zIndex:    9999,
    });
  }, [open, align, minWidth, dropUp]);

  // Close on outside click or scroll
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    const closeScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", closeScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", closeScroll, true);
    };
  }, [open]);

  const panel = (
    <div
      ref={panelRef}
      style={{
        ...panelStyle,
        backdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06)",
        transformOrigin: panelStyle.bottom != null ? "bottom" : "top",
        transition: "opacity 0.15s ease, transform 0.15s cubic-bezier(0.34,1.4,0.64,1)",
        opacity:   open ? 1 : 0,
        transform: open ? "scale(1) translateY(0)" : `scale(0.95) translateY(${panelStyle.bottom != null ? "6px" : "-6px"})`,
        pointerEvents: open ? "auto" : "none",
      }}
      className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-zinc-950"
    >
      <div className="py-1.5 max-h-64 overflow-y-auto">
        {options.map((opt, idx) => {
          const active = opt.value === value;
          return (
            <button
              type="button"
              key={`${opt.value}-${idx}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] font-medium transition-all ${
                active
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/8"
                  : "text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              {opt.color && (
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: opt.color, opacity: active ? 1 : 0.5 }} />
              )}
              <span className="flex-1 text-left">{opt.label}</span>
              {active && <Check size={11} className="text-cyan-500 dark:text-cyan-400 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={`relative ${className}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium shadow-sm transition-all whitespace-nowrap select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30 ${
          disabled
            ? "border-slate-200/30 dark:border-white/5 bg-white/30 dark:bg-zinc-900/30 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50"
            : "border-slate-200 dark:border-white/10 bg-white/90 dark:bg-zinc-900/80 text-slate-700 dark:text-slate-200 hover:border-emerald-400/70 dark:hover:border-emerald-400/45 hover:shadow-emerald-500/10"
        }`}
      >
        {selected?.color && (
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: selected.color }} />
        )}
        <span className="flex-1 text-left text-[12px]">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={12}
          className={`ml-1 shrink-0 transition-transform duration-200 text-slate-400 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Portal panel — escapes overflow:hidden and z-index stacking */}
      {typeof document !== "undefined" && createPortal(panel, document.body)}
    </div>
  );
}
