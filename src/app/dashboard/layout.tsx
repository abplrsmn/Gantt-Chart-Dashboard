"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Users, AlertTriangle, CalendarRange,
  Bell, X, Database, BarChart2, ShieldAlert, SunMoon, LogOut, Settings, TableProperties,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "admin";
  const match = document.cookie.match(/(?:^|;\s*)user_role=([^;]+)/);
  return match ? match[1].trim() : "admin";
}

function getUserIdFromCookie(): string {
  if (typeof document === "undefined") return "default";
  const match = document.cookie.match(/(?:^|;\s*)user_id=([^;]+)/);
  return match ? match[1].trim() : "default";
}

type AlertProject = { id: string; end_date: string | null; overall_progress_pct: string | null };
type ToastState   = { visible: boolean; count: number };

function playPing() {
  try {
    const W = window as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const ctx: AudioContext = new (W.AudioContext || W.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
  } catch { /* ignore */ }
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────
function SideNavItem({ icon, label, active, onClick, badge }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg overflow-hidden transition-all duration-150 ${
        active
          ? "glass-nav-active shadow-sm text-brand-mahogany dark:text-brand-sand"
          : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {/* Icon — fixed, stays put while label slides in */}
      <span className="relative shrink-0 w-5 h-5 flex items-center justify-center">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded-full bg-red-500 text-white animate-pulse leading-none px-0.5 z-10">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>

      {/* Label — clipped by button overflow-hidden when sidebar is narrow */}
      <span className="text-[13px] font-semibold whitespace-nowrap leading-none flex-1 text-left">
        {label}
      </span>

      {/* Badge pill (only visible when expanded) */}
      {badge != null && badge > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white shrink-0">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [userRole, setUserRole]   = useState<string>("admin");
  const [alertCount, setAlertCount] = useState(0);
  const [toast, setToast]         = useState<ToastState>({ visible: false, count: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const settingsRef    = useRef<HTMLDivElement>(null);
  const mainRef        = useRef<HTMLElement>(null);
  const expandTimerRef = useRef<number | null>(null);
  const prevAlertCountRef = useRef<number | null>(null);
  const toastTimerRef     = useRef<number | null>(null);
  const pathnameRef       = useRef(pathname);

  // Only expand when cursor is clearly inside the icon column (left 44px of 56px sidebar).
  // Prevents accidental trigger when cursor grazes the right edge heading to content.
  function scheduleExpand(clientX: number) {
    if (sidebarExpanded) return;
    if (clientX > 44) {
      if (expandTimerRef.current) { clearTimeout(expandTimerRef.current); expandTimerRef.current = null; }
      return;
    }
    setSidebarExpanded(true);
  }

  function handleSidebarEnter(e: React.MouseEvent) { scheduleExpand(e.clientX); }
  function handleSidebarMove(e: React.MouseEvent)  { scheduleExpand(e.clientX); }
  function handleSidebarLeave() {
    if (expandTimerRef.current) { clearTimeout(expandTimerRef.current); expandTimerRef.current = null; }
    setSidebarExpanded(false);
    setSettingsOpen(false);
  }

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  // main is the scroll container now (root is overflow-hidden), so reset its
  // scroll on navigation — the window no longer scrolls for Next to reset.
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [pathname]);
  useEffect(() => { setUserRole(getRoleFromCookie()); }, []);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!settingsRef.current?.contains(e.target as Node)) setSettingsOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Toast on new alerts
  useEffect(() => {
    const prev = prevAlertCountRef.current;
    if (prev === null) { prevAlertCountRef.current = alertCount; return; }
    if (alertCount > prev) {
      playPing();
      setToast({ visible: true, count: alertCount });
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 5000) as unknown as number;
    }
    prevAlertCountRef.current = alertCount;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertCount]);

  function dismissedKey() { return `alerts_dismissed_${new Date().toDateString()}_${getUserIdFromCookie()}`; }
  function getDismissedIds(): Set<string> {
    try { const r = localStorage.getItem(dismissedKey()); return r ? new Set(JSON.parse(r)) : new Set(); } catch { return new Set(); }
  }
  function saveDismissedIds(ids: string[]) {
    try { localStorage.setItem(dismissedKey(), JSON.stringify(ids)); } catch { /* ignore */ }
  }
  function getAlertProjectIds(projects: AlertProject[]): string[] {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return projects.flatMap(p => {
      if (Number(p.overall_progress_pct ?? 0) >= 100) return [];
      const end = p.end_date ? new Date(p.end_date) : null;
      if (end && Math.ceil((end.getTime() - today.getTime()) / 86_400_000) <= 7) return [p.id];
      return [];
    });
  }

  useEffect(() => {
    if (pathname !== "/dashboard/alerts") return;
    setAlertCount(0);
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json()).then(j => { if (j.success) saveDismissedIds(getAlertProjectIds(j.data)); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function fetchAlerts() {
      fetch("/api/projects/gantt", { cache: "no-store" })
        .then(r => r.json()).then(j => {
          if (!j.success || pathnameRef.current === "/dashboard/alerts") return;
          const unseen = getAlertProjectIds(j.data).filter(id => !getDismissedIds().has(id));
          setAlertCount(unseen.length);
        }).catch(() => {});
    }
    fetchAlerts();
    const id = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogout() {
    setSettingsOpen(false);
    try { await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" }); } catch { /* continue */ }
    localStorage.removeItem("gantt_dateRange");
    localStorage.removeItem("projects_dateRange");
    window.location.href = "/";
  }

  const isPm = userRole === "pm";

  const adminNavItems = [
    { icon: <Home size={16} />,             label: "Home",          path: "/dashboard" },
    { icon: <CalendarRange size={16} />,    label: "Projects",      path: "/dashboard/projects/gantt" },
    { icon: <TableProperties size={16} />,  label: "Summary",       path: "/dashboard/projects/summary-matrix" },
    { icon: <BarChart2 size={16} />,        label: "Report",        path: "/dashboard/weekly-report" },
    { icon: <Users size={16} />,            label: "Team",          path: "/dashboard/team" },
    { icon: <ShieldAlert size={16} />,      label: "Alerts",        path: "/dashboard/alerts", badge: alertCount },
    { icon: <Database size={16} />,         label: "Master Setup",  path: "/dashboard/master" },
  ];

  const pmNavItems = [
    { icon: <CalendarRange size={16} />, label: "Projects", path: "/dashboard/projects/gantt" },
    { icon: <AlertTriangle size={16} />, label: "Alerts",   path: "/dashboard/alerts", badge: alertCount },
  ];

  const navItems = isPm ? pmNavItems : adminNavItems;

  // Active match: exact for home & summary-matrix, prefix for others
  function isActive(path: string) {
    if (path === "/dashboard") return pathname === "/dashboard";
    if (path === "/dashboard/projects/summary-matrix") return pathname === path;
    if (path === "/dashboard/projects/gantt") {
      return pathname === path || (pathname.startsWith("/dashboard/projects") && pathname !== "/dashboard/projects/summary-matrix");
    }
    return pathname === path || pathname.startsWith(path);
  }

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-500 ${isDark ? "mesh-bg-dark" : "mesh-bg-light"}`}>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        onMouseEnter={handleSidebarEnter}
        onMouseMove={handleSidebarMove}
        onMouseLeave={handleSidebarLeave}
        className={`fixed left-0 top-0 h-screen z-50 flex flex-col
                   transition-[width] duration-200 ease-out
                   bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl
                   border-r border-slate-200/60 dark:border-white/8
                   select-none ${sidebarExpanded ? "w-56" : "w-14"}`}
      >

        {/* Logo — display only */}
        <div className="flex items-center gap-3 px-3.5 py-4 shrink-0 border-b border-slate-200/50 dark:border-white/6">
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-white">
            <img src="/logo_perusahaan.jpg" alt="" className="w-full h-full object-contain" />
          </div>
          <span className={`text-[11px] font-extrabold tracking-widest uppercase text-slate-700 dark:text-slate-200 whitespace-nowrap transition-opacity duration-150 delay-75 ${sidebarExpanded ? "opacity-100" : "opacity-0"}`}>
            Aryaduta
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          {navItems.map(item => (
            <SideNavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              active={isActive(item.path)}
              onClick={() => router.push(item.path)}
              badge={(item as { badge?: number }).badge}
            />
          ))}
        </nav>

        {/* Settings button — bottom of sidebar */}
        <div ref={settingsRef} className="relative px-2 py-3 shrink-0 border-t border-slate-200/50 dark:border-white/6">
          <button
            onClick={() => setSettingsOpen(v => !v)}
            className={`relative w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg overflow-hidden transition-all duration-150 ${
              settingsOpen
                ? "glass-nav-active shadow-sm text-brand-mahogany dark:text-brand-sand"
                : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <span className="shrink-0 w-5 h-5 flex items-center justify-center">
              <Settings size={16} />
            </span>
            <span className={`text-[13px] font-semibold whitespace-nowrap leading-none flex-1 text-left transition-opacity duration-150 delay-75 ${sidebarExpanded ? "opacity-100" : "opacity-0"}`}>
              Settings
            </span>
          </button>

          {/* Dropdown — opens upward */}
          {settingsOpen && (
            <div className="absolute left-2 bottom-full mb-1 w-44 rounded-lg border border-slate-200 dark:border-white/10 p-1.5 z-200 bg-white dark:bg-zinc-950 shadow-2xl backdrop-blur-xl animate-dropdown-enter">
              <button
                onClick={() => { setTheme(isDark ? "light" : "dark"); setSettingsOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <SunMoon size={14} />
                {isDark ? "Switch to Light" : "Switch to Dark"}
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-white/5" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut size={14} />
                Log Out
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content — fixed 56px left offset for collapsed sidebar ── */}
      <main ref={mainRef} className="flex-1 min-w-0 ml-14 px-4 pb-8 pt-5 overflow-y-auto">
        <div className="max-w-390 mx-auto">
          {children}
        </div>
      </main>

      {/* ── Alert toast ───────────────────────────────────────────────────── */}
      <div className={`fixed top-4 right-4 z-9999 transition-all duration-300 ${
        toast.visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}>
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md bg-white/90 dark:bg-zinc-900/90 border-red-200/60 dark:border-red-500/30 min-w-64 max-w-80">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center mt-0.5">
            <Bell size={15} className="text-red-500 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-bold text-slate-800 dark:text-white">
              {toast.count > 1 ? "New Alerts" : "New Alert"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {toast.count} project{toast.count > 1 ? "s" : ""} need attention
            </p>
            <button
              onClick={() => { router.push("/dashboard/alerts"); setToast(t => ({ ...t, visible: false })); }}
              className="mt-1.5 text-[10px] font-bold text-red-500 hover:text-red-600 transition-colors"
            >
              View Alerts →
            </button>
          </div>
          <button
            onClick={() => setToast(t => ({ ...t, visible: false }))}
            className="shrink-0 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

    </div>
  );
}
