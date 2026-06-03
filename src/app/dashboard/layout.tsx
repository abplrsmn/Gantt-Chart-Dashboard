"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, AlertTriangle, Menu, ChevronRight, Server, CalendarRange, X, Bell } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import QuickMenu from "@/components/dashboard/QuickMenu";

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

type AlertProject = { id: string; end_date: string | null; overall_progress_pct: string | null; created_at?: string | null };
type ToastState   = { visible: boolean; count: number };

function playPing() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const W = window as any;
    const ctx: AudioContext = new (W.AudioContext || W.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) { void e; }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [userRole, setUserRole] = useState<string>("admin");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [toast, setToast] = useState<ToastState>({ visible: false, count: 0 });
  const prevAlertCountRef = useRef(null as number | null);
  const toastTimerRef = useRef(null as number | null);
  const pathnameRef = useRef(pathname);

  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
  useEffect(() => { setUserRole(getRoleFromCookie()); }, []);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

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

  function dismissedKey() {
    return `alerts_dismissed_${new Date().toDateString()}_${getUserIdFromCookie()}`;
  }

  function getDismissedIds(): Set<string> {
    try {
      const raw = localStorage.getItem(dismissedKey());
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  }

  function saveDismissedIds(ids: string[]) {
    try { localStorage.setItem(dismissedKey(), JSON.stringify(ids)); } catch { /* ignore */ }
  }

  function getAlertProjectIds(projects: AlertProject[]): string[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ids: string[] = [];
    for (const p of projects) {
      const progress = Number(p.overall_progress_pct ?? 0);
      if (progress >= 100) continue;
      const end = p.end_date ? new Date(p.end_date) : null;
      if (end) {
        const daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);
        if (daysLeft <= 7) { ids.push(p.id); continue; }
      }
      if (p.created_at) {
        const daysSince = Math.floor((today.getTime() - new Date(p.created_at).getTime()) / 86_400_000);
        if (daysSince <= 7) ids.push(p.id);
      }
    }
    return ids;
  }

  useEffect(() => {
    if (pathname !== "/dashboard/alerts") return;
    setAlertCount(0);
    fetch("/api/projects/gantt", { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        if (!json.success) return;
        saveDismissedIds(getAlertProjectIds(json.data));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    function fetchAlerts() {
      fetch("/api/projects/gantt", { cache: "no-store" })
        .then(r => r.json())
        .then(json => {
          if (!json.success) return;
          if (pathnameRef.current === "/dashboard/alerts") return;
          const currentIds = getAlertProjectIds(json.data);
          const dismissed  = getDismissedIds();
          const unseen     = currentIds.filter(id => !dismissed.has(id));
          setAlertCount(unseen.length);
        })
        .catch(() => {});
    }
    fetchAlerts();
    const id = setInterval(fetchAlerts, 60_000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPm = userRole === "pm";

  const navItems = [
    { icon: <Home size={16} />, label: "Home",     path: "/dashboard" },
    { icon: <CalendarRange size={16} />, label: "Projects", path: "/dashboard/projects/gantt" },
    { icon: <Users size={16} />, label: "Team",     path: "/dashboard/team" },
    { icon: <AlertTriangle size={16} />, label: "Alerts",   path: "/dashboard/alerts", badge: alertCount },
    { icon: <Server size={16} />, label: "Controls", path: "/dashboard/controls" },
  ];

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${isDark ? "mesh-bg-dark" : "mesh-bg-light"}`}>

      {!isPm && (
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl transition-colors duration-300">
          <div className="w-full px-6 h-14 flex items-center justify-between relative">

            <button
              className="md:hidden p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-white/20 transition-all"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </button>

            <div className="flex items-center gap-2.5 shrink-0 absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0">
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                <img src="/logo_perusahaan.jpg" alt="Aryaduta" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight tracking-wider text-slate-800 dark:text-slate-100">
                  ARYADUTA DASHBOARD
                </h1>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1 ml-auto">
              <nav className="flex items-center gap-1 mr-6">
                {navItems.map(item => (
                  <TopNavItem
                    key={item.path}
                    icon={item.icon}
                    label={item.label}
                    active={pathname === item.path}
                    onClick={() => router.push(item.path)}
                    badge={(item as { badge?: number }).badge}
                  />
                ))}
              </nav>
              <QuickMenu />
            </div>

            <div className="md:hidden relative">
              <QuickMenu />
            </div>
          </div>
        </header>
      )}

      {!isPm && drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {!isPm && (
        <aside
          className={`md:hidden fixed left-0 top-0 h-screen w-64 z-50 flex flex-col bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-slate-200/50 dark:border-white/5 shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="px-4 py-4 flex items-center border-b border-slate-200/40 dark:border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                <img src="/logo_perusahaan.jpg" alt="Aryaduta" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-sm font-bold tracking-wider text-slate-800 dark:text-slate-100">
                PROJECT DASHBOARD
              </h1>
            </div>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map(item => (
              <DrawerNavItem
                key={item.path}
                icon={item.icon}
                label={item.label}
                active={pathname === item.path}
                onClick={() => { router.push(item.path); setDrawerOpen(false); }}
                badge={(item as { badge?: number }).badge}
              />
            ))}
          </nav>

          <div className="p-4 border-t border-slate-200/40 dark:border-white/5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">Quick Menu</p>
            <div className="flex flex-col gap-2">
              <QuickMenu align="left" />
            </div>
          </div>
        </aside>
      )}

      <main className={`px-4 pb-8 w-full max-w-390 mx-auto ${isPm ? "pt-4" : "pt-4"}`}>
        {children}
      </main>

      <div
        className={`fixed top-4 right-4 z-9999 transition-all duration-300 ${
          toast.visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
        }`}
      >
        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl border shadow-xl backdrop-blur-md bg-white/90 dark:bg-zinc-900/90 border-red-200/60 dark:border-red-500/30 min-w-64 max-w-80">
          <div className="shrink-0 w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center mt-0.5">
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
              View Alerts
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

function TopNavItem({ icon, label, active, onClick, badge }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        active
          ? "glass-nav-active shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      <span className="relative shrink-0">
        {icon}
        {badge != null && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold rounded-full bg-red-500 text-white animate-pulse leading-none px-0.5">
            {badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

function DrawerNavItem({ icon, label, active, onClick, badge }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl relative transition-all duration-200 ${
        active
          ? "glass-nav-active shadow-sm"
          : "text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white animate-pulse leading-none shrink-0">
          {badge}
        </span>
      )}
      {active && !badge && <ChevronRight size={14} className="ml-auto opacity-50 shrink-0" />}
    </button>
  );
}
