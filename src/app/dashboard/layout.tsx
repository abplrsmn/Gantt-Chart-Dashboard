"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, Activity, AlertTriangle, Menu, ChevronRight } from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDark]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const navItems = [
    { icon: <Home size={16} />, label: "Home", path: "/dashboard" },
    { icon: <Users size={16} />, label: "Team", path: "/dashboard/team" },
    { icon: <Activity size={16} />, label: "Health", path: "/dashboard/health" },
    { icon: <AlertTriangle size={16} />, label: "Alerts", path: "/dashboard/alerts" },
  ];

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${isDark ? 'mesh-bg-dark' : 'mesh-bg-light'}`}>

      {/* ── TOP NAVBAR ── */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-slate-200/40 dark:border-white/5 shadow-sm transition-colors duration-300">
        <div className="w-full px-6 h-14 flex items-center justify-between">

          {/* Mobile: burger button — far left */}
          <button
            className="md:hidden p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-gray-200 hover:bg-white dark:hover:bg-white/20 transition-all"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={18} />
          </button>

          {/* Logo — centre on mobile, far left on desktop */}
          <div className="flex items-center gap-2.5 shrink-0 md:ml-0 absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0">
            <div className="w-8 h-8 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white shadow shrink-0">
              <Activity size={15} />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight bg-gradient-to-r from-blue-600 to-purple-500 dark:from-blue-400 dark:to-purple-300 bg-clip-text text-transparent tracking-wider">
                COMMAND CENTER
              </h1>
              <div className="flex items-center text-[10px] text-slate-400 dark:text-slate-500">
                Aryaduta's Dashboard Monitor
              </div>
            </div>
          </div>

          {/* Desktop: nav + theme toggle — far right */}
          <div className="hidden md:flex items-center gap-1 ml-auto">
            <nav className="flex items-center gap-1 mr-6">
              {navItems.map(item => (
                <TopNavItem
                  key={item.path}
                  icon={item.icon}
                  label={item.label}
                  active={pathname === item.path}
                  onClick={() => router.push(item.path)}
                  hasBadge={item.badge}
                />
              ))}
            </nav>
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-full bg-white/50 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all shadow-sm text-sm"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>

          {/* Mobile: theme toggle — far right */}
          <button
            className="md:hidden p-2 rounded-full bg-white/50 dark:bg-white/10 border border-slate-200/60 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-all shadow-sm text-sm"
            onClick={() => setIsDark(!isDark)}
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── MOBILE DRAWER OVERLAY ── */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
      <aside
        className={`md:hidden fixed left-0 top-0 h-screen w-64 z-50 flex flex-col bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-slate-200/50 dark:border-white/5 shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Drawer header */}
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

        {/* Drawer nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => (
            <DrawerNavItem
              key={item.path}
              icon={item.icon}
              label={item.label}
              active={pathname === item.path}
              onClick={() => router.push(item.path)}
              hasBadge={item.badge}
            />
          ))}
        </nav>

        {/* Drawer theme toggle */}
        <div className="p-4 border-t border-slate-200/40 dark:border-white/5">
          <button
            onClick={() => setIsDark(!isDark)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/40 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 hover:bg-white/70 dark:hover:bg-white/10 transition-all text-slate-600 dark:text-gray-300"
          >
            <span className="text-sm">{isDark ? '☀️' : '🌙'}</span>
            <span className="text-xs font-medium">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="p-4 w-full max-w-5xl mx-auto pb-8">
        {children}
      </main>
    </div>
  );
}

function TopNavItem({
  icon, label, active, onClick, hasBadge = false,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; hasBadge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
        active
          ? 'bg-blue-500/15 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20 dark:ring-blue-400/20'
          : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {icon}
      <span>{label}</span>
      {hasBadge && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      )}
    </button>
  );
}

function DrawerNavItem({
  icon, label, active, onClick, hasBadge = false,
}: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void; hasBadge?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl relative transition-all duration-200 ${
        active
          ? 'bg-blue-500/15 dark:bg-blue-400/20 text-blue-600 dark:text-blue-400 shadow-sm ring-1 ring-blue-500/20 dark:ring-blue-400/20'
          : 'text-slate-500 dark:text-slate-400 hover:bg-white/40 dark:hover:bg-white/10 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      {hasBadge && (
        <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
      )}
      {active && !hasBadge && (
        <ChevronRight size={14} className="ml-auto opacity-50 shrink-0" />
      )}
    </button>
  );
}
