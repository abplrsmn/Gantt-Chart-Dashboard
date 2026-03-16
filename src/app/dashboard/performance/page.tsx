"use client";

import { useEffect, useState } from "react";
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
};

export default function HealthPage() {
  const [data, setData] = useState<DeptStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="text-blue-500" size={24} />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Project Performance</h2>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {data.map((d) => (
              <div key={d.department} className="glass-card p-4 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl" />
                <p className="text-xs text-slate-500 dark:text-gray-400">{d.department}</p>
                <p className="text-2xl font-bold text-slate-800 dark:text-white mt-1">{d.total}</p>
                <p className="text-xs text-slate-400 mt-1">total task</p>
                <div className="mt-2 flex gap-2 text-xs">
                  <span className="text-green-400">✓ {d.completed}</span>
                  <span className="text-red-400">⚠ {d.overdue}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="glass-card p-6 relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-cyan-500 rounded-t-2xl" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-white mb-6">Task Overview per Departemen</h3>
            <ResponsiveContainer width="100%" height={256}>
              <BarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }} barCategoryGap="12%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="department" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value, _name, payload) => {
                    const d = payload?.payload as DeptStats | undefined;
                    if (!d) return [value, "Total Task"];
                    return [`Total: ${d.total} | Completed: ${d.completed} | Overdue: ${d.overdue}`, "Department Stats"];
                  }}
                  contentStyle={{
                    backgroundColor: "rgba(15,23,42,0.9)",
                    border: "1px solid rgba(148,163,184,0.2)",
                    borderRadius: "12px",
                    backdropFilter: "blur(10px)",
                  }}
                  labelStyle={{ color: "#f1f5f9", fontWeight: "bold" }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="total" name="Department Total" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={35} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
