"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type DeptStats = {
  department: string;
  total: number;
  completed: number;
  overdue: number;
  inProgress: number;
  recentWindowDays?: number;
  recentTotal?: number;
  recentCompleted?: number;
  recentOverdueOpen?: number;
  recentInProgress?: number;
  onTimeCompleted?: number;
  completedWithDueDate?: number;
};

type DeptPerformance = DeptStats & {
  completionRate: number;
  overdueRate: number;
  onTimeRate: number;
  sourceTotal: number;
  score: number;
};

function toPerformance(d: DeptStats): DeptPerformance {
  const sourceTotalRaw = d.recentTotal ?? d.total;
  const sourceCompletedRaw = d.recentCompleted ?? d.completed;
  const sourceInProgressRaw = d.recentInProgress ?? d.inProgress;
  const sourceOverdueOpenRaw = d.recentOverdueOpen ?? d.overdue;

  const sourceTotal = sourceTotalRaw > 0 ? sourceTotalRaw : 1;
  const sourceInProgress = sourceInProgressRaw > 0 ? sourceInProgressRaw : 1;

  const completionRate = (sourceCompletedRaw / sourceTotal) * 100;
  const overdueRate = (sourceOverdueOpenRaw / sourceInProgress) * 100;

  const completedWithDueDate = d.completedWithDueDate ?? 0;
  const onTimeCompleted = d.onTimeCompleted ?? 0;
  const onTimeRate =
    completedWithDueDate > 0
      ? (onTimeCompleted / completedWithDueDate) * 100
      : completionRate;

  // Weighted score focused on recent throughput, deadline discipline, and overdue pressure.
  const rawScore = completionRate * 0.55 + onTimeRate * 0.25 + (100 - overdueRate) * 0.2;
  const score = Math.max(0, Math.min(100, Number(rawScore.toFixed(1))));

  return {
    ...d,
    completionRate: Number(completionRate.toFixed(1)),
    overdueRate: Number(overdueRate.toFixed(1)),
    onTimeRate: Number(onTimeRate.toFixed(1)),
    sourceTotal,
    score,
  };
}

export default function HealthPage() {
  const [data, setData] = useState<DeptStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  const performanceData = useMemo(
    () => data.map(toPerformance).sort((a, b) => b.score - a.score),
    [data]
  );

  const recentWindowDays = data[0]?.recentWindowDays ?? 60;

  useEffect(() => {
    fetch("/api/clickup/health")
      .then((r) => r.json())
      .then((res) => {
        if (res.error) setError(res.error);
        else setData(res.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const onChange = () => setIsMobile(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-start gap-2 mb-4">
        <Activity className="text-blue-500" size={24} />
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Project Performance</h2>
          <p className="text-[11px] text-slate-500 dark:text-gray-400 mt-0.5">
            Based on {recentWindowDays === 30 ? "last month" : `last ${recentWindowDays} days`}: ✓ completion · ⏱ on-time delivery · ⚠ overdue pressure
          </p>
        </div>
      </div>

      {loading && (
        <div className="glass-card p-9 flex items-center justify-center h-72">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
        </div>
      )}

      {error && (
        <div className="glass-card p-4 text-red-400 border border-red-500/30">
          Error: {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {performanceData.map((d) => (
              <div key={d.department} className="glass-card p-4 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl" />
                <p className="text-xs text-slate-500 dark:text-gray-400">{d.department}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{d.score}%</p>
                <p className="text-xs text-slate-400 mt-1">performance score ({d.sourceTotal} period tasks)</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="text-green-400">✓ {d.completionRate}%</span>
                  <span className="text-cyan-400">⏱ {d.onTimeRate}%</span>
                  <span className="text-red-400">⚠ {d.overdueRate}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="glass-card p-6 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-6">Department Performance Score</h3>
            <ResponsiveContainer width="100%" height={isMobile ? 300 : 256}>
              <BarChart
                data={performanceData}
                margin={{
                  top: 6,
                  right: isMobile ? 8 : 20,
                  left: isMobile ? -12 : 0,
                  bottom: isMobile ? 24 : 6,
                }}
                barCategoryGap={isMobile ? "20%" : "12%"}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis
                  dataKey="department"
                  stroke="#94a3b8"
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  interval={0}
                  angle={isMobile ? -20 : 0}
                  textAnchor={isMobile ? "end" : "middle"}
                  height={isMobile ? 46 : 30}
                />
                <YAxis
                  stroke="#94a3b8"
                  domain={[0, 100]}
                  allowDecimals={false}
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  tickFormatter={(v) => `${v}%`}
                  width={isMobile ? 34 : 42}
                />
                <Tooltip
                  formatter={(value, _name, payload) => {
                    const d = payload?.payload as DeptPerformance | undefined;
                    if (!d) return [value, "Performance Score"];
                    return [
                      `Score: ${d.score}% | Completed: ${d.completionRate}% | On-time: ${d.onTimeRate}% | Overdue: ${d.overdueRate}% | Period tasks: ${d.sourceTotal}`,
                      "Department Performance",
                    ];
                  }}
                  contentStyle={{
                    backgroundColor: "rgba(15,23,42,0.9)",
                    border: "1px solid rgba(148,163,184,0.2)",
                    borderRadius: "12px",
                    backdropFilter: "blur(10px)",
                  }}
                  labelStyle={{ color: "#f1f5f9", fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ fontSize: isMobile ? "10px" : "12px" }} />
                <Bar
                  dataKey="score"
                  name="Performance Score (%)"
                  fill="#06b6d4"
                  radius={[6, 6, 0, 0]}
                  barSize={isMobile ? 24 : 35}
                  maxBarSize={isMobile ? 30 : 40}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
