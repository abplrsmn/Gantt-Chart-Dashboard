"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";

export default function AuditLogPage() {
  const router = useRouter();

  return (
    <div className="space-y-4 pb-8 animate-page-enter">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-xl bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm shrink-0"
        >
          <ArrowLeft size={16} className="text-slate-600 dark:text-gray-300" />
        </button>
        <h2 className="text-base font-bold text-slate-800 dark:text-white">Audit Log</h2>
      </div>

      <div className="glass-card flex flex-col items-center justify-center gap-3 py-24 text-center">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/8 flex items-center justify-center">
          <Clock size={22} className="text-slate-400" />
        </div>
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Audit Log Coming Soon</p>
        <p className="text-xs text-slate-400 max-w-xs">This feature is under construction. Check back later to view the full history of changes for this project.</p>
      </div>
    </div>
  );
}
