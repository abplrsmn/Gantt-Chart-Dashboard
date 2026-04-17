"use client";

import { useEffect, useState } from "react";
import { Users, Loader2 } from "lucide-react";
import Link from "next/link";

type Department = {
  name: string;
  spaceId: string;
  teams: string[];
};

export default function TeamPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchStructure() {
      try {
        const res = await fetch("/api/clickup/structure", { cache: "no-store" });
        const data = await res.json();

        if (cancelled) return;

        if (data.success) {
          setDepartments(Array.isArray(data.data?.departments) ? data.data.departments : []);
          setError("");
        } else {
          setError(data.error || "Failed to load departments & teams");
        }
      } catch (error: any) {
        if (!cancelled) {
          setError(error?.message || "Failed to load departments & teams");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchStructure();
    const interval = setInterval(fetchStructure, 30000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-4">
        <Users className="text-purple-500" size={24} />
        <h2 className="text-lg font-bold text-slate-700 dark:text-gray-100 drop-shadow-sm">Departments & Teams</h2>
      </div>

      {loading && departments.length === 0 ? (
        <div className="glass-card p-10 flex flex-col items-center justify-center text-center">
          <Loader2 className="animate-spin text-purple-500 mb-4" size={32} />
          <p className="text-sm font-medium text-slate-500 dark:text-gray-400">Syncing live team structure...</p>
        </div>
      ) : error ? (
        <div className="glass-card p-4 text-red-400 border border-red-500/30">
          Error: {error}
        </div>
      ) : departments.length > 0 ? (
        <div className="grid gap-6">
          {departments.map((dept) => (
            <div key={dept.spaceId} className="glass-card p-6 relative overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-200 dark:border-slate-700/50 pb-3">
                <h2 className="text-sm font-bold text-slate-800 dark:text-white">
                  {dept.name} Department
                </h2>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {dept.teams.length} team{dept.teams.length === 1 ? '' : 's'}
                </span>
              </div>

              {dept.teams.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {dept.teams.map((team) => (
                    <Link key={`${dept.spaceId}-${team}`} href={`/dashboard/team/${encodeURIComponent(team.toLowerCase())}`}>
                      <div className="p-4 bg-white/40 dark:bg-zinc-800/40 rounded-xl border border-slate-200/60 dark:border-zinc-700/60 flex flex-col justify-between hover:border-purple-500/30 hover:bg-white/60 dark:hover:bg-zinc-800/60 transition-all group cursor-pointer h-full">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-bold border border-purple-500/20 group-hover:scale-110 transition-transform">
                            {team.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-gray-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {team} Team
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400 py-2">
                  No team folders found in this department yet.
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          No departments found from ClickUp yet.
        </div>
      )}
    </div>
  );
}
