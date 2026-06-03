"use client";

import { useEffect, useState, useMemo } from "react";
import { Users, UserCircle2, Mail, Briefcase, Shield } from "lucide-react";

type UserAccount = {
  id: string;
  full_name: string | null;
  email: string;
  department: string | null;
  job_title: string | null;
  employee_code: string | null;
  is_admin: boolean;
  is_active: boolean;
};

type Stakeholder = {
  id: string;
  full_name: string;
  nickname: string | null;
  email: string | null;
  department: string | null;
  job_title: string | null;
  employee_code: string | null;
  is_active: boolean;
};

type Tab = "users" | "stakeholders";

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = [
    "bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400",
    "bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400",
    "bg-teal-100 dark:bg-teal-500/20 text-teal-600 dark:text-teal-400",
    "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400",
    "bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const sz = size === "sm" ? "w-8 h-8 text-[11px]" : "w-10 h-10 text-xs";
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {initials}
    </div>
  );
}

function PersonCard({ name, email, jobTitle, department, isActive, isAdmin, employeeCode }: {
  name: string; email?: string | null; jobTitle?: string | null;
  department?: string | null; isActive: boolean; isAdmin?: boolean; employeeCode?: string | null;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
      isActive
        ? "bg-white dark:bg-zinc-900/60 border-slate-200/60 dark:border-white/8"
        : "bg-slate-50/50 dark:bg-white/2 border-slate-200/40 dark:border-white/5 opacity-60"
    }`}>
      <Avatar name={name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-[12px] font-semibold text-slate-800 dark:text-white truncate">{name}</p>
          {isAdmin && (
            <span className="flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
              <Shield size={8} /> Admin
            </span>
          )}
          <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            isActive ? "bg-green-100 dark:bg-green-500/15 text-emerald-600 dark:text-emerald-400"
                     : "bg-slate-100 dark:bg-white/8 text-slate-400"
          }`}>
            {isActive ? "Active" : "Inactive"}
          </span>
        </div>
        {jobTitle && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
            <Briefcase size={9} className="shrink-0" /> {jobTitle}
          </p>
        )}
        {email && (
          <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5 truncate">
            <Mail size={9} className="shrink-0" /> {email}
          </p>
        )}
        {employeeCode && (
          <p className="text-[9px] font-mono text-slate-300 dark:text-slate-600 mt-0.5">{employeeCode}</p>
        )}
      </div>
    </div>
  );
}

function DepartmentGroup({ dept, children, count }: { dept: string; children: React.ReactNode; count: number }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">{dept}</span>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-400">{count}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {children}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/master/users").then(r => r.json()),
      fetch("/api/master/people").then(r => r.json()),
    ]).then(([u, s]) => {
      if (u.success) setUsers(u.data);
      if (s.success) setStakeholders(s.data);
    }).finally(() => setLoading(false));
  }, []);

  const usersByDept = useMemo(() => {
    const map = new Map<string, UserAccount[]>();
    for (const u of users) {
      const dept = u.department ?? "No Department";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(u);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [users]);

  const stakeholdersByDept = useMemo(() => {
    const map = new Map<string, Stakeholder[]>();
    for (const s of stakeholders) {
      const dept = s.department ?? "No Department";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stakeholders]);

  const activeUsers = users.filter(u => u.is_active).length;
  const activeStakeholders = stakeholders.filter(s => s.is_active).length;

  return (
    <div className="space-y-5 pb-6 animate-page-enter">
      <div className="flex items-center gap-2 mb-3 mt-2">
        <Users className="text-purple-500" size={16} />
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">Departments & Teams</h2>
      </div>

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3">
          <div className="glass-card p-4">
            <div className="flex items-center gap-1.5 mb-1 text-violet-500">
              <UserCircle2 size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">User Accounts</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{users.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{activeUsers} active</p>
          </div>
          <div className="glass-card p-4">
            <div className="flex items-center gap-1.5 mb-1 text-teal-500">
              <Users size={13} />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Stakeholders</span>
            </div>
            <p className="text-2xl font-bold text-slate-800 dark:text-white">{stakeholders.length}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{activeStakeholders} active</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100/80 dark:bg-white/6 border border-slate-200/60 dark:border-white/8 w-fit">
        {([
          { key: "users",        label: "User Accounts", count: users.length },
          { key: "stakeholders", label: "Stakeholders",  count: stakeholders.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
              tab === key
                ? "bg-white dark:bg-zinc-800 shadow-sm text-slate-800 dark:text-white"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            {label}
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              tab === key ? "bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400" : "bg-slate-200 dark:bg-white/8 text-slate-400"
            }`}>{count}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-purple-400/40 border-t-purple-500 rounded-full animate-spin" />
        </div>
      ) : tab === "users" ? (
        <div className="space-y-5">
          {usersByDept.map(([dept, members]) => (
            <DepartmentGroup key={dept} dept={dept} count={members.length}>
              {members.map(u => (
                <PersonCard
                  key={u.id}
                  name={u.full_name ?? u.email}
                  email={u.email}
                  jobTitle={u.job_title}
                  department={u.department}
                  isActive={u.is_active}
                  isAdmin={u.is_admin}
                  employeeCode={u.employee_code}
                />
              ))}
            </DepartmentGroup>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {stakeholdersByDept.map(([dept, members]) => (
            <DepartmentGroup key={dept} dept={dept} count={members.length}>
              {members.map(s => (
                <PersonCard
                  key={s.id}
                  name={s.full_name}
                  email={s.email}
                  jobTitle={s.job_title}
                  department={s.department}
                  isActive={s.is_active}
                  employeeCode={s.employee_code}
                />
              ))}
            </DepartmentGroup>
          ))}
        </div>
      )}
    </div>
  );
}
