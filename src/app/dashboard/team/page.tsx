"use client";

import { Users } from "lucide-react";

export default function TeamPage() {
  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <div className="flex items-center gap-2 mb-4">
        <Users className="text-purple-500" size={24} />
        <h2 className="text-lg font-bold text-slate-700 dark:text-gray-100 drop-shadow-sm">Departments & Teams</h2>
      </div>

      <div className="glass-card p-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
          <Users size={32} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">Teams coming soon</h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 max-w-sm">
            This page will be connected to team data from the database soon.
          </p>
        </div>
      </div>
    </div>
  );
}
