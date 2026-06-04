"use client";

import { useState, useRef, useEffect } from "react";
import { Settings2, SunMoon, LogOut, Database } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useRouter } from "next/navigation";

export default function QuickMenu({ align = "right", dropUp = false }: { align?: "left" | "right"; dropUp?: boolean }) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = async () => {
    setOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
    } catch { /* continue */ }
    localStorage.removeItem("gantt_dateRange");
    localStorage.removeItem("projects_dateRange");
    window.location.href = "/";
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all shadow-sm text-slate-600 dark:text-slate-200"
        aria-label="Open quick menu"
        aria-expanded={open}
      >
        <span className={`block transition-transform duration-200 ease-out ${open ? "rotate-90 scale-105" : "rotate-0 scale-100"}`}>
          <Settings2 size={16} />
        </span>
      </button>

      <div
        className={`absolute ${align === "right" ? "right-0" : "left-0"} ${dropUp ? "bottom-full mb-2 origin-bottom-left" : "mt-2 origin-top-left"} w-48 rounded-xl border border-slate-200 dark:border-white/10 p-1.5 z-200 overflow-hidden bg-white dark:bg-zinc-950/97 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out ${open ? "opacity-100 translate-y-0 scale-100 pointer-events-auto" : `opacity-0 ${dropUp ? "translate-y-1.5" : "-translate-y-1.5"} scale-95 pointer-events-none`}`}
        aria-hidden={!open}
      >
          <button
            onClick={() => { router.push("/dashboard/master"); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <Database size={14} />
            Master Setup
          </button>
          <div className="my-1 border-t border-slate-100 dark:border-white/5" />
          <button
            onClick={() => { setTheme(isDark ? "light" : "dark"); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <SunMoon size={14} />
            {isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <LogOut size={14} />
            Log Out
          </button>
      </div>
    </div>
  );
}


