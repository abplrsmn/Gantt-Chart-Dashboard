"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Home, Users, AlertTriangle, Menu, ChevronRight, Server, CalendarRange } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import QuickMenu from "@/components/dashboard/QuickMenu";

function getRoleFromCookie(): string {
  if (typeof document === "undefined") return "admin";
  const match = document.cookie.match(/(?:^|;\s*)user_role=([^;]+)/);
  return match ? match[1].trim() : "admin";
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [userRole, setUserRole] = useState<string>("admin");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => { setUserRole(getRoleFromCookie()); }, []);
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const isPm = userRole === "pm";

  const navItems = [
    { icon: <Home size={16} />, label: "Home", path: "/dashboard" },
    { icon: <CalendarRange size={16} />, label: "Projects", path: "/dashboard/projects/gantt" },
    { icon: <Users size={16} />, label: "Team", path: "/dashboard/team" },
    { icon: <AlertTriangle size={16} />, label: "Alerts", path: "/dashboard/alerts" },
    { icon: <Server size={16} />, label: "Controls", path: "/dashboard/controls" },
  ];

  return (
    <div className={`min-h-screen w-full transition-colors duration-500 ${isDark ? "mesh-bg-dark" : "mesh-bg-light"}`}>

      {/* ── TOP NAVBAR — admin only ── */}
      {!isPm && (
        <header className="sticky top-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl transition-colors duration-300">
          <div className="w-full px-6 h-14 flex items-center justify-between relative">

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-xl bg-white/50 dark:bg-white/10 border border-slate-200/50 dark:border-white/10 text-slate-600 dark:text-gray-200 hover:bg-white dark:hover:bg-white/20 transition-all"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </button>

            {/* Logo */}
            <div className="flex items-center gap-2.5 shrink-0 absolute left-1/2 -translate-x-1/2 md:static md:translate-x-0">
              <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
                <img src="/aryaduta_logo.png" alt="Aryaduta" className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight tracking-wider text-slate-800 dark:text-slate-100">
                  ARYADUTA DASHBOARD
                </h1>
              </div>
            </div>

            {/* Desktop: nav + quick menu */}
            <div className="hidden md:flex items-center gap-1 ml-auto">
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
              <QuickMenu />
            </div>

            {/* Mobile: quick menu only */}
            <div className="md:hidden relative">
              <QuickMenu />
            </div>
          </div>
        </header>
      )}

      {/* ── MOBILE DRAWER — admin only ── */}
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
                <img src="/aryaduta_logo.png" alt="Aryaduta" className="w-full h-full object-contain" />
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

      {/* ── MAIN CONTENT ── */}
      <main className={`px-4 pb-8 w-full max-w-390 mx-auto ${isPm ? "pt-4" : "pt-4"}`}>
        {children}
      </main>
    </div>
  );
}

function TopNavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
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
      {icon}
      <span>{label}</span>
    </button>
  );
}

function DrawerNavItem({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
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
      {active && <ChevronRight size={14} className="ml-auto opacity-50 shrink-0" />}
    </button>
  );
}
