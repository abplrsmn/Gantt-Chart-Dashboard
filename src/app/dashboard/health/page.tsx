"use client";

import { Activity } from "lucide-react";

export default function HealthPage() {
  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="text-blue-500" size={24} />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Project Health</h2>
      </div>
      
      <div className="glass-card p-9 flex flex-col items-center justify-center text-center h-72 relative overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl"></div>
        <div className="absolute inset-4 rounded-xl border border-blue-500/10 dark:border-blue-500/5 pointer-events-none"></div>
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500/20 to-cyan-500/10 rounded-2xl flex items-center justify-center mb-4 text-blue-500 border border-blue-500/20">
          <Activity size={30} />
        </div>
        <h3 className="text-base font-bold text-slate-800 dark:text-gray-100 mb-2">Project Health Tracker</h3>
        <p className="text-xs text-slate-500 dark:text-gray-400 max-w-xs leading-relaxed">
          Visualizations for RAG status, task aging, and burn-down charts will be displayed here.
        </p>
        <span className="mt-4 text-[10px] font-bold text-blue-400/60 dark:text-blue-400/50 uppercase tracking-widest">Coming Soon</span>
      </div>
    </div>
  );
}