"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Users, CalendarRange,
  Bell, X, Database, BarChart2, ShieldAlert, SunMoon, LogOut, TableProperties,
  MessageSquare, ChevronDown,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

/** "Dashboard Admin" → "DA"; falls back to a person glyph when the name is empty. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
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
      title={label}
      className={`relative w-full flex items-center justify-center px-2.5 py-2.5 rounded-lg transition-colors duration-150 ${
        active
          ? "glass-nav-active shadow-sm text-brand-mahogany dark:text-brand-sand"
          : "text-slate-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      <span className="relative shrink-0 w-5 h-5 flex items-center justify-center">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded-full bg-red-500 text-white animate-pulse leading-none px-0.5 z-10">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </span>
    </button>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [userName, setUserName]   = useState<string>("");
  const [alertCount, setAlertCount] = useState(0);
  const [toast, setToast]         = useState<ToastState>({ visible: false, count: 0 });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef    = useRef<HTMLDivElement>(null);
  const mainRef        = useRef<HTMLElement>(null);
  const prevAlertCountRef = useRef<number | null>(null);
  const toastTimerRef     = useRef<number | null>(null);
  const pathnameRef       = useRef(pathname);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  // Natural document flow now scrolls the window, so reset window scroll on
  // navigation (and main's own scroll, if any inner container ever uses it).
  useEffect(() => { window.scrollTo(0, 0); mainRef.current?.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store", credentials: "include" })
      .then(r => r.json())
      .then(j => { if (j.success) setUserName(j.data.fullName || j.data.email || ""); })
      .catch(() => {});
  }, []);
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

  const navItems = [
    { icon: <Home size={16} />,             label: "Home",          path: "/dashboard" },
    { icon: <CalendarRange size={16} />,    label: "Projects",      path: "/dashboard/projects/gantt" },
    { icon: <TableProperties size={16} />,  label: "Summary",       path: "/dashboard/projects/summary-matrix" },
    { icon: <BarChart2 size={16} />,        label: "Report",        path: "/dashboard/weekly-report" },
    { icon: <Users size={16} />,            label: "Team",          path: "/dashboard/team" },
    { icon: <MessageSquare size={16} />,    label: "Chat",          path: "/dashboard/chat" },
    { icon: <ShieldAlert size={16} />,      label: "Alerts",        path: "/dashboard/alerts", badge: alertCount },
    { icon: <Database size={16} />,         label: "Master Setup",  path: "/dashboard/master" },
  ];

  // Gantt & Summary are single-screen views with their own internal scroll, so
  // the app shell is locked to the viewport (no browser scroll). Every other
  // page uses natural document flow so it ends exactly at its last card.
  const fullHeightPage =
    pathname === "/dashboard/projects/gantt" ||
    pathname === "/dashboard/projects/summary-matrix" ||
    pathname === "/dashboard/chat";

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
    <div className={`flex transition-colors duration-500 ${fullHeightPage ? "h-screen overflow-hidden" : "min-h-screen"}`}>

      {/* Full-viewport background — fixed so it always covers the screen even
          when a page's content is shorter than the viewport, and so it never
          adds scrollable empty space below the last card. */}
      <div className={`fixed inset-0 -z-10 pointer-events-none ${isDark ? "mesh-bg-dark" : "mesh-bg-light"}`} />

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className="fixed left-2 top-2 bottom-2 z-50 flex flex-col items-start gap-3 select-none">

        {/* Logo lockup — display only; the account menu lives in the top-right profile button */}
        <div
          className="shrink-0 px-2.5 py-2 rounded-2xl
                     bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl
                     border border-slate-200/60 dark:border-white/8
                     shadow-lg shadow-slate-900/5 dark:shadow-black/30"
        >
          <div className="flex items-center gap-2 py-1 pr-2">
            <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black">
              K
            </div>
            <span className="text-[13px] font-extrabold tracking-tight text-slate-800 dark:text-white whitespace-nowrap">
              Keystone
            </span>
          </div>
        </div>

        {/* Nav card — icon-only width, centered in the space below the (wider) logo
            card, so there's a clear gap between logo and rail */}
        <div className="flex-1 min-h-0 w-14 flex items-center justify-center">
        <nav
          className="shrink-0 w-14 max-h-full px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden flex flex-col rounded-2xl
                     bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl
                     border border-slate-200/60 dark:border-white/8
                     shadow-lg shadow-slate-900/5 dark:shadow-black/30"
        >
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
        </div>
      </aside>

      {/* ── Profile (top-right) — account menu: theme + logout ─────────────── */}
      <div ref={settingsRef} className="fixed top-2 right-2 z-10000">
        <button
          onClick={() => setSettingsOpen(v => !v)}
          title={userName || "Account"}
          aria-haspopup="menu"
          aria-expanded={settingsOpen}
          className={`flex items-center gap-2 pl-2 pr-2.5 py-2 rounded-2xl
                      bg-white/85 dark:bg-zinc-950/85 backdrop-blur-xl
                      border border-slate-200/60 dark:border-white/8
                      shadow-lg shadow-slate-900/5 dark:shadow-black/30
                      transition-all duration-150 hover:bg-white dark:hover:bg-zinc-950
                      ${settingsOpen ? "ring-2 ring-emerald-500/40" : ""}`}
        >
          <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center brand-gradient text-white text-[10px] font-black">
            {initialsOf(userName)}
          </span>
          <ChevronDown
            size={14}
            className={`text-slate-400 shrink-0 transition-transform duration-200 ${settingsOpen ? "rotate-180" : ""}`}
          />
        </button>

        {settingsOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-slate-200 dark:border-white/10 p-1.5 bg-white dark:bg-zinc-950 shadow-2xl backdrop-blur-xl animate-dropdown-enter origin-top-right"
          >
            {userName && (
              <>
                <div className="flex items-center gap-2.5 px-2.5 py-2">
                  <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center brand-gradient text-white text-[10px] font-black">
                    {initialsOf(userName)}
                  </span>
                  <p className="text-[12px] font-bold text-slate-700 dark:text-white/85 truncate">{userName}</p>
                </div>
                <div className="mb-1 border-t border-slate-100 dark:border-white/5" />
              </>
            )}
            <button
              role="menuitem"
              onClick={() => { setTheme(isDark ? "light" : "dark"); setSettingsOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-white/70 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              <SunMoon size={14} />
              {isDark ? "Switch to Light" : "Switch to Dark"}
            </button>
            <div className="my-1 border-t border-slate-100 dark:border-white/5" />
            <button
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <LogOut size={14} />
              Log Out
            </button>
          </div>
        )}
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      {/* Indented only past the narrow icon rail (8px + 56px = 64px) and pushed
          below the logo card (ends at 62px), so content tucks *under* the wide
          logo instead of being shoved out past it.
          Natural document flow: the page is exactly as tall as its content and
          the browser scrolls when needed, so there is never scrollable empty
          space below the last card. Full-viewport pages (gantt/summary/chat)
          size themselves with their own calc(100vh − 96px) wrapper — that
          96px is this element's pt-16 + pb-8, so keep them in sync. */}
      <main ref={mainRef} className={`flex-1 min-w-0 ml-20 px-4 pb-8 pt-16 ${fullHeightPage ? "overflow-hidden" : ""}`}>
        <div className="max-w-390 mx-auto">
          {children}
        </div>
      </main>

      {/* ── Alert toast ───────────────────────────────────────────────────── */}
      {/* Sits below the profile button (which occupies the top-right corner). */}
      <div className={`fixed top-18 right-2 z-9999 transition-all duration-300 ${
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
