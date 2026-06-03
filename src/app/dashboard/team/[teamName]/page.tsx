"use client";

import { Users, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function TeamDetailsPage() {
  const params = useParams();
  const teamName = params.teamName as string;
  const decodedTeamName = teamName ? decodeURIComponent(teamName) : "";

  return (
    <div className="space-y-6 pb-6 animate-page-enter">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/team" className="p-2 rounded-lg bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm shrink-0 self-center">
          <ArrowLeft size={18} className="text-slate-600 dark:text-slate-300" />
        </Link>
        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 leading-none">
            {decodedTeamName || "Team"} — Members & Access List
          </p>
        </div>
      </div>

      <div className="glass-card p-16 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
          <Users size={32} />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1">Team detail coming soon</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            Team member data will be connected to the database soon.
          </p>
        </div>
      </div>
    </div>
  );
}
