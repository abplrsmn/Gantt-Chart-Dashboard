"use client";

import { Users, Lock } from "lucide-react";
import Link from "next/link";

export default function TeamPage() {
  const departments = [
    { name: "IDEA", teams: ["Tech", "Data", "Digital"] },
    { name: "Marketing", teams: ["M1", "M2"] },
    { name: "Finance", teams: ["F1"] },
    { name: "HR", teams: ["HR1"] }
  ];

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-4">
        <Users className="text-purple-500" size={24} />
        <h2 className="text-lg font-bold text-slate-700 dark:text-gray-100 drop-shadow-sm">Departments & Teams</h2>
      </div>
      
      <div className="grid gap-6">
        {departments.map((dept) => (
          <div key={dept.name} className="glass-card p-6 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-purple-500 to-pink-500 rounded-t-2xl"></div>
            <h2 className="text-sm font-bold text-slate-800 dark:text-white mb-4 border-b border-slate-200 dark:border-slate-700/50 pb-3">
              {dept.name} Department
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {dept.teams.map((team) => (
                <Link key={team} href={`/dashboard/team/${team.toLowerCase()}`}>
                  <div className="p-4 bg-white/40 dark:bg-zinc-800/40 rounded-xl border border-slate-200/60 dark:border-zinc-700/60 flex flex-col justify-between hover:border-purple-500/30 hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-all group cursor-pointer h-full">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold border border-purple-500/20 group-hover:scale-110 transition-transform">
                        {team.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">{team} Team</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
