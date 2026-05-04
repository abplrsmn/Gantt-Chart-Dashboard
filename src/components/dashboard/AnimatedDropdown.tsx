"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface DropdownOption {
  value: string;
  label: string;
  color?: string; // optional color dot
}

interface Props {
  value: string;
  options: DropdownOption[];
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  align?: "left" | "right";
  minWidth?: number;
}

export default function AnimatedDropdown({
  value, options, onChange, placeholder = "Select…",
  className = "", align = "left", minWidth = 160,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all whitespace-nowrap select-none ${
          open
            ? "border-cyan-500/60 bg-cyan-500/8 text-cyan-400 shadow-sm"
            : "border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 text-slate-700 dark:text-slate-200 hover:border-cyan-400/40 hover:text-cyan-400"
        }`}
      >
        {selected?.color && (
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: selected.color }} />
        )}
        <span className="text-[12px]">{selected?.label ?? placeholder}</span>
        <ChevronDown
          size={12}
          className={`ml-1 shrink-0 transition-transform duration-200 ${open ? "rotate-180 text-cyan-400" : "text-slate-400"}`}
        />
      </button>

      {/* Dropdown panel */}
      <div
        className="absolute z-50 mt-1.5 rounded-xl border border-white/10 shadow-2xl overflow-hidden"
        style={{
          ...(align === "right" ? { right: 0 } : { left: 0 }),
          minWidth: `${minWidth}px`,
          backgroundColor: "rgba(11,15,26,0.97)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)",
          transformOrigin: "top",
          transition: "opacity 0.18s ease, transform 0.18s cubic-bezier(0.34,1.4,0.64,1)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1) translateY(0)" : "scale(0.95) translateY(-6px)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        <div className="py-1.5">
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] font-medium transition-all ${
                  active
                    ? "text-white bg-white/8"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {opt.color && (
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: opt.color, opacity: active ? 1 : 0.5 }} />
                )}
                <span className="flex-1 text-left">{opt.label}</span>
                {active && <Check size={11} className="text-cyan-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
