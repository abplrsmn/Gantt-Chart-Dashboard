"use client";

import { Activity } from "lucide-react";

export default function HealthPage() {
  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <div className="flex items-start gap-2 mb-3 mt-2">
        <Activity className="text-blue-500" size={16} />
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Project Performance</h2>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
            Completion · On-time delivery · Overdue pressure
          </p>
        </div>
      </div>

      <div className="glass-card p-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
          <Activity size={32} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">Performance coming soon</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm">
            This page will be connected to performance data from the database soon.
          </p>
        </div>
      </div>
    </div>
  );
}
