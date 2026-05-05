"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { Home, Users, Activity, AlertTriangle, Menu, ChevronRight, Settings2, LogOut, SunMoon, Server, CalendarRange } from "lucide-react";

// Read the plain 'user_role' cookie (non-httpOnly, set by server on login)
function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "admin";
  const match = document.cookie.match(/(?:^|;\s*)user_role=([^;]+)/);
  return match ? match[1].trim() : "admin";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>("admin");
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUserRole(getRoleFromCookie());
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    setDrawerOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include", cache: "no-store" });
    } catch { /* continue */ }
    window.location.href = "/";
  };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    setDrawerOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!desktopMenuRef.current?.contains(t) && !mobileMenuRef.current?.contains(t)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // PM sees NO nav items — only the settings gear (theme + logout) remains
  const isPm = userRole === "pm";

  const navItems = isPm ? [] : [
    { icon: <Home size={16} />, label: "Home", path: "/dashboard" },
    { icon: <CalendarRange size={16} />, label: "Capex Tracker", path: "/dashboard/capex-gantt" },
    { icon: <Users size={16} />, label: "Team", path: "/dashboard/team" },
    { icon: <AlertTriangle size={16} />, label: "Alerts", path: "/dashboard/alerts" },
    { icon: <Server size={16} />, label: "Controls", path: "/dashboard/controls" },
  ];

  const QuickMenu = () => (
    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-white/10 shadow-xl p-1.5 z-50">
      <button
        onClick={() => setIsDark(!isDark)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
      >
        <SunMoon size={14} />
        {isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      </button>
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
      >
        <LogOut size={14} />
        Log Out
      </button>
    </div>
  );

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${isDark ? "mesh-bg-dark" : "mesh-bg-light"}`}>

      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-slate-200/40 dark:border-white/5 shadow-sm transition-colors duration-300">
        <div className="w-full px-6 h-14 flex items-center justify-between relative">

          {/* Mobile: burger — hidden for PM */}
          {!isPm ? (
            <button
              className="md:hidden p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-gray-200 hover:bg-white dark:hover:bg-white/20 transition-all"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </button>
          ) : (
            <div className="md:hidden w-9" />
          )}

          {/* Logo */}
          <div className="flex items-center gap-2.5 shrink-0 absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow shrink-0">
              <Activity size={15} />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight bg-gradient-to-r from-blue-600 to-purple-500 dark:from-blue-400 dark:to-purple-300 bg-clip-text text-transparent tracking-wider">
                COMMAND CENTER
              </h1>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">Aryaduta's Dashboard Monitor</div>
            </div>
          </div>

          {/* Desktop right: nav items + gear */}
          <div className="hidden md:flex items-center gap-1 ml-auto">
            {navItems.length > 0 && (
              <nav className="flex items-center gap-1 mr-6">
                {navItems.map(item => (
                  <TopNavItem
                    key={item.path}
                    icon={item.icon}
                    label={item.label}
                    active={pathname === item.path}
                    onClick={() => router.push(item.path)}
                  />
                ))}
              </nav>
            )}
            <div ref={desktopMenuRef} className="relative">
              <button
                onClick={() => setMenuOpen(p => !p)}
                className="p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all shadow-sm text-slate-600 dark:text-gray-200"
                aria-label="Open quick menu"
              >
                <Settings2 size={16} />
              </button>
              {menuOpen && <QuickMenu />}
            </div>
          </div>

          {/* Mobile right: gear only */}
          <div ref={mobileMenuRef} className="md:hidden relative">
            <button
              className="p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all shadow-sm text-slate-600 dark:text-gray-200"
              onClick={() => setMenuOpen(p => !p)}
              aria-label="Open quick menu"
            >
              <Settings2 size={16} />
            </button>
            {menuOpen && <QuickMenu />}
          </div>
        </div>
      </header>

      {/* ── MOBILE DRAWER (admin only) ── */}
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
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow shrink-0">
                <Activity size={15} />
              </div>
              <h1 className="text-sm font-bold bg-gradient-to-r from-blue-600 to-purple-500 dark:from-blue-400 dark:to-purple-300 bg-clip-text text-transparent tracking-wider">
                COMMAND CENTER
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
                onClick={() => router.push(item.path)}
              />
            ))}
          </nav>

          <div className="p-4 border-t border-slate-200/40 dark:border-white/5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1">Quick Menu</p>
            <button
              onClick={() => setIsDark(!isDark)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 transition-all text-slate-600 dark:text-gray-300"
            >
              <SunMoon size={14} />
              <span className="text-xs font-medium">{isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-50/80 dark:bg-red-500/10 border border-red-200/70 dark:border-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/15 transition-all text-red-600 dark:text-red-400"
            >
              <LogOut size={14} />
              <span className="text-xs font-medium">Log Out</span>
            </button>
          </div>
        </aside>
      )}

      {/* ── MAIN CONTENT ── */}
      <main className="p-4 w-full max-w-[1560px] mx-auto pb-8">
        {children}
      </main>
    </div>
  );
}

function TopNavItem({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        active
          ? "bg-blue-500/15 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20 dark:ring-blue-400/20"
          : "text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DrawerNavItem({
  icon, label, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl relative transition-all duration-200 ${
        active
          ? "bg-blue-500/15 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20 dark:ring-blue-400/20"
          : "text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      {active && <ChevronRight size={14} className="ml-auto opacity-50 shrink-0" />}
    </button>
  );
}
