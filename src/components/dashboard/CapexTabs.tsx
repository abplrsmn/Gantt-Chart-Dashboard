"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, Activity } from "lucide-react";

export default function CapexTabs() {
  const pathname = usePathname();

  const tabs = [
    { name: "Gantt Chart", path: "/dashboard/capex-gantt", icon: <CalendarRange size={15} /> },
    { name: "Projects S-Curve", path: "/dashboard/projects", icon: <Activity size={15} /> },
  ];

  return (
    <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/40 dark:bg-zinc-900/40 backdrop-blur-md border border-slate-300/50 dark:border-white/10 rounded-2xl mb-6 w-fit shadow-inner">
      {tabs.map(tab => {
        const active = pathname === tab.path;
        return (
          <Link
            key={tab.path}
            href={tab.path}
            className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-300 transform ${
              active
                ? "bg-white dark:bg-zinc-800 text-cyan-600 dark:text-cyan-400 shadow-md border border-slate-200/60 dark:border-white/10 scale-100"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/40 dark:hover:bg-white/5 border border-transparent scale-[0.98] hover:scale-100"
            }`}
          >
            <span className={`${active ? "text-cyan-500" : "text-slate-400"}`}>{tab.icon}</span>
            {tab.name}
          </Link>
        );
      })}
    </div>
  );
}
