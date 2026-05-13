"use client";

import { ShieldAlert } from "lucide-react";

export default function AlertsPage() {
  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <div className="flex items-center gap-2 mb-3 mt-2">
        <ShieldAlert size={16} className="text-red-500" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Live Alerts</h2>
      </div>

      <div className="glass-card p-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center">
          <ShieldAlert size={32} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">Alerts coming soon</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm">
            This page will be connected to the database monitoring system soon.
          </p>
        </div>
      </div>
    </div>
  );
}
