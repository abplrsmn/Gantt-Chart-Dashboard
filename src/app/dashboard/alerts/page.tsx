"use client";

import { ShieldAlert } from "lucide-react";

export default function AlertsPage() {
  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="glass-card p-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 overflow-hidden relative">
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2 bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl border border-red-500/20">
            <ShieldAlert size={20} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-gray-200 uppercase tracking-tight">Live Alerts</h2>
            <p className="text-[11px] font-bold text-slate-400 dark:text-gray-500 uppercase tracking-widest leading-none">Real-time Task Monitoring</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">Alerts sedang dipersiapkan</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm">
            Halaman ini akan segera terhubung ke sistem monitoring database.
          </p>
        </div>
      </div>
    </div>
  );
}
