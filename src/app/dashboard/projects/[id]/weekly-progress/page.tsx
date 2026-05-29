"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { format, eachWeekOfInterval, addDays, parseISO, isValid } from "date-fns";
import { ArrowLeft, Camera, ImageIcon } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type WeekEntry = {
  week: number;
  monthKey: string;
  monthLabel: string;
  range: string;
  plan: number;
  actual: number;
  status: string;
  photos: number;
};

type ProjectMeta = {
  pm_start: string | null;
  pm_end: string | null;
  start_date: string | null;
  end_date: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildWeeks(startRaw: string | null, endRaw: string | null): WeekEntry[] {
  const start = startRaw ? parseISO(startRaw) : null;
  const end   = endRaw   ? parseISO(endRaw)   : null;
  if (!start || !isValid(start) || !end || !isValid(end) || start > end) return [];

  const mondays = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  return mondays.map((mon, i) => {
    const sun     = addDays(mon, 6);
    const weekEnd = sun > end ? end : sun;
    const monthKey = format(mon, "MMM yyyy");
    return {
      week:       i + 1,
      monthKey,
      monthLabel: format(mon, "MMMM yyyy"),
      range:      `${format(mon, "d MMM")} – ${format(weekEnd, "d MMM")}`,
      plan:       0,
      actual:     0,
      status:     "Not started",
      photos:     0,
    };
  });
}

// ─── WeekCard ─────────────────────────────────────────────────────────────────
function WeekCard({ week, range, plan, actual, status, photos }: WeekEntry) {
  const colsClass = photos === 1 ? "grid-cols-1" : photos === 2 ? "grid-cols-2" : "grid-cols-3";
  const variance  = Number((actual - plan).toFixed(2));

  return (
    <div className="rounded-xl border border-slate-200/70 dark:border-white/8 overflow-hidden">
      <div className="px-4 py-2.5 flex items-center gap-3" style={{ backgroundColor: "rgba(251,191,36,0.14)" }}>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700 dark:text-amber-400">Week {week}</span>
        <span className="text-[10px] font-semibold text-amber-600/80 dark:text-amber-500/80">{range}</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-amber-600/60 dark:text-amber-500/50">
          <Camera size={10} />
          {photos > 0 ? `${photos} photo${photos > 1 ? "s" : ""}` : "No photos"}
        </span>
      </div>

      <div className="p-3 space-y-3 bg-white/40 dark:bg-zinc-900/20">
        {photos === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200/70 dark:border-white/8 py-8 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600">
            <Camera size={20} className="opacity-40" />
            <p className="text-[10px] font-medium">No photos yet — kirim lewat Telegram</p>
          </div>
        ) : (
          <div className={`grid gap-2 ${colsClass}`}>
            {Array.from({ length: Math.min(photos, 6) }).map((_, i) => (
              <div key={i} className="aspect-video rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/8 flex items-center justify-center">
                <ImageIcon size={18} className="text-slate-300 dark:text-white/15" />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 dark:bg-white/3 rounded-lg px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Progress Plan</p>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{plan > 0 ? `${plan.toFixed(2)}%` : "—"}</p>
          </div>
          <div className="bg-slate-50 dark:bg-white/3 rounded-lg px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Actual Progress</p>
            <p className={`text-sm font-bold ${actual <= 0 ? "text-slate-400 dark:text-slate-600" : actual >= plan ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
              {actual > 0 ? `${actual.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-white/3 rounded-lg px-3 py-2.5">
            <p className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Variance</p>
            <p className={`text-sm font-bold ${variance > 0 ? "text-emerald-600 dark:text-emerald-400" : variance < 0 ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-600"}`}>
              {actual > 0 ? `${variance > 0 ? "+" : ""}${variance.toFixed(2)}%` : "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold ${
            status === "On progress"   ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : status === "Completed"   ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            : status === "Not started" ? "bg-slate-100 dark:bg-white/5 text-slate-400"
            :                            "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              status === "On progress"   ? "bg-blue-500"
              : status === "Completed"   ? "bg-emerald-500"
              : status === "Not started" ? "bg-slate-400"
              :                            "bg-amber-500"
            }`} />
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WeeklyProgressPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<ProjectMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/projects/${id}`, { cache: "no-store" })
      .then(r => r.json())
      .then(json => {
        if (json.success) setProject(json.data.project);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const startDate = project?.pm_start ?? project?.start_date ?? null;
  const endDate   = project?.pm_end   ?? project?.end_date   ?? null;
  const weeks     = buildWeeks(startDate, endDate);
  const months    = Array.from(new Map(weeks.map(w => [w.monthKey, w.monthLabel])).entries());
  const [activeKey, setActiveKey] = useState<string>("");

  useEffect(() => {
    if (months.length > 0 && !activeKey) {
      setActiveKey(months[months.length - 1][0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const filtered = weeks.filter(w => w.monthKey === activeKey);

  return (
    <div className="space-y-4 pb-10 animate-page-enter">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
        >
          <ArrowLeft size={15} />
          Back
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-32">
          <div className="w-6 h-6 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
        </div>
      ) : (
        <div className="glass-card overflow-hidden">
          {/* Card header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/50 dark:border-white/8">
            <Camera size={13} className="shrink-0" style={{ color: "var(--brand-sienna)" }} />
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Weekly Progress</h3>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
              Photos via Telegram
            </span>
          </div>

          {weeks.length === 0 ? (
            <div className="p-8 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-600">
              <Camera size={20} className="opacity-40" />
              <p className="text-xs">Set project start &amp; end dates to generate weekly progress cards.</p>
            </div>
          ) : (
            <>
              {/* Month tabs */}
              <div className="flex items-center gap-1 px-4 py-2.5 border-b border-slate-200/50 dark:border-white/8 bg-slate-50/50 dark:bg-white/2 flex-wrap">
                {months.map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveKey(key)}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                      activeKey === key
                        ? "text-white shadow-sm"
                        : "text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-white/8 hover:text-slate-700 dark:hover:text-slate-200"
                    }`}
                    style={activeKey === key ? { backgroundColor: "var(--brand-sienna)" } : undefined}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-auto text-[10px] text-slate-400 dark:text-slate-500">
                  {filtered.length} week{filtered.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Week cards */}
              <div className="p-4 space-y-3">
                {filtered.map(w => <WeekCard key={w.week} {...w} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
