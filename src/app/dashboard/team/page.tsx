"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Mail, Briefcase, Building2, Search, FolderKanban } from "lucide-react";

type UserAccount = {
  id: string;
  full_name: string | null;
  email: string;
  department: string | null;
  job_title: string | null;
  employee_code: string | null;
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

type Project = {
  id: string;
  project_code: string | null;
  project_name: string;
  unit_code: string | null;
  unit_name: string | null;
  overall_progress_pct: number;
  current_phase_name: string | null;
  status_label: string | null;
  status_color: string | null;
};

type Assignment = {
  person_id: string;
  project_id: string;
  project_code: string | null;
  project_name: string;
  overall_progress_pct: number | null;
  phase_name: string | null;
  status_label: string | null;
  status_color: string | null;
  role_name: string | null;
};

type UnitGroup = { code: string; name: string; projects: Project[] };

type Tab = "users" | "stakeholders" | "units";

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
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold shrink-0 ring-2 ring-white dark:ring-zinc-900`}>
      {initials}
    </div>
  );
}

function PersonCard({ name, email, jobTitle, isActive, employeeCode, assignments, router }: {
  name: string; email?: string | null; jobTitle?: string | null;
  isActive: boolean; employeeCode?: string | null;
  assignments: Assignment[]; router: ReturnType<typeof useRouter>;
}) {
  const visible = assignments.slice(0, 3);
  const extra = assignments.length - visible.length;

  return (
    <div className={`flex flex-col gap-2.5 p-3 rounded-xl border transition-all ${
      isActive
        ? "bg-white dark:bg-zinc-900/60 border-slate-200/60 dark:border-white/8"
        : "bg-slate-50/50 dark:bg-white/2 border-slate-200/40 dark:border-white/5 opacity-60"
    }`}>
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[12px] font-semibold text-slate-800 dark:text-white truncate">{name}</p>
            <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
              isActive ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
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

      {/* Project assignments — pulled from project_people, so this reflects real
          project involvement rather than just directory metadata. */}
      <div className="pl-13 -mt-1">
        {assignments.length === 0 ? (
          <p className="text-[10px] text-slate-300 dark:text-slate-600 italic">No project assignments</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {visible.map((a) => (
              <button
                key={a.project_id}
                onClick={() => router.push(`/dashboard/projects/${a.project_id}`)}
                title={`${a.role_name ?? "Involved"} · ${a.project_name}`}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-white/6 hover:bg-emerald-100 dark:hover:bg-emerald-500/15 transition-colors"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: a.status_color || "#94a3b8" }}
                />
                <span className="text-[9px] font-bold font-mono text-slate-600 dark:text-slate-300">
                  {a.project_code ?? a.project_name.slice(0, 10)}
                </span>
              </button>
            ))}
            {extra > 0 && (
              <span className="flex items-center px-1.5 py-0.5 text-[9px] font-bold text-slate-400">+{extra} more</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DepartmentGroup({ dept, children, count }: { dept: string; children: React.ReactNode; count: number }) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="block w-1 h-4 rounded-full shrink-0 brand-gradient" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{dept}</span>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-400">{count}</span>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" /></div>}>
      <TeamContent />
    </Suspense>
  );
}

function TeamContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    if (t === "stakeholders") return "stakeholders";
    if (t === "units") return "units";
    return "users";
  });
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [stakeholders, setStakeholders] = useState<Stakeholder[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitSearch, setUnitSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [stakeholderSearch, setStakeholderSearch] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/master/users").then(r => r.json()),
      fetch("/api/master/people").then(r => r.json()),
      fetch("/api/projects/gantt", { cache: "no-store" }).then(r => r.json()),
      fetch("/api/team/assignments", { cache: "no-store" }).then(r => r.json()),
    ]).then(([u, s, p, a]) => {
      if (u.success) setUsers(u.data);
      if (s.success) setStakeholders(s.data);
      if (p.success) setProjects(p.data);
      if (a.success) setAssignments(a.data);
    }).finally(() => setLoading(false));
  }, []);

  const assignmentsByPerson = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (!map.has(a.person_id)) map.set(a.person_id, []);
      map.get(a.person_id)!.push(a);
    }
    return map;
  }, [assignments]);

  const usersByDept = useMemo(() => {
    const q = userSearch.toLowerCase();
    const filtered = q
      ? users.filter(u => [u.full_name, u.email, u.department, u.job_title, u.employee_code].join(" ").toLowerCase().includes(q))
      : users;
    const map = new Map<string, UserAccount[]>();
    for (const u of filtered) {
      const dept = u.department ?? "No Department";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(u);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [users, userSearch]);

  const units = useMemo<UnitGroup[]>(() => {
    const map = new Map<string, UnitGroup>();
    for (const p of projects) {
      const code = p.unit_code ?? "—";
      const name = p.unit_name ?? p.unit_code ?? "Unknown Unit";
      if (!map.has(code)) map.set(code, { code, name, projects: [] });
      map.get(code)!.projects.push(p);
    }
    return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [projects]);

  const filteredUnits = useMemo(() => {
    if (!unitSearch.trim()) return units;
    const q = unitSearch.toLowerCase();
    return units
      .map(u => ({
        ...u,
        projects: u.projects.filter(p =>
          [p.project_name, p.project_code, p.current_phase_name, p.status_label].join(" ").toLowerCase().includes(q)
        ),
      }))
      .filter(u => u.code.toLowerCase().includes(q) || u.name.toLowerCase().includes(q) || u.projects.length > 0);
  }, [units, unitSearch]);

  const stakeholdersByDept = useMemo(() => {
    const q = stakeholderSearch.toLowerCase();
    const filtered = q
      ? stakeholders.filter(s => [s.full_name, s.email, s.department, s.job_title, s.employee_code].join(" ").toLowerCase().includes(q))
      : stakeholders;
    const map = new Map<string, Stakeholder[]>();
    for (const s of filtered) {
      const dept = s.department ?? "No Department";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [stakeholders, stakeholderSearch]);

  const totalAssigned = useMemo(
    () => new Set(assignments.map(a => a.person_id)).size,
    [assignments]
  );

  return (
    <div className="space-y-4 pb-6 animate-page-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1 mt-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="text-emerald-500" size={16} />
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">Departments & Teams</h2>
        </div>
        {!loading && totalAssigned > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <FolderKanban size={12} className="text-emerald-500" />
            {totalAssigned} people with active project assignments
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100/80 dark:bg-white/6 border border-slate-200/60 dark:border-white/8 flex-wrap">
        {([
          { key: "users",        label: "PIC",           count: users.length },
          { key: "stakeholders", label: "Stakeholders",  count: stakeholders.length },
          { key: "units",        label: "Units",         count: units.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
              tab === key
                ? "brand-gradient text-white shadow-sm"
                : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                tab === key ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-white/8 text-slate-400"
              }`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-brand-sienna/40 border-t-brand-sienna rounded-full animate-spin" />
        </div>
      ) : tab === "units" ? (
        <div className="space-y-4">
          <label className="relative block w-full max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={unitSearch}
              onChange={e => setUnitSearch(e.target.value)}
              placeholder="Search unit or project..."
              className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
            />
          </label>
          {filteredUnits.length === 0 ? (
            <p className="text-center text-slate-400 dark:text-slate-500 text-sm py-16">No units found.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredUnits.map(u => (
                <div key={u.code} className="glass-card p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 brand-gradient-soft">
                      <Building2 size={16} className="text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-slate-800 dark:text-white truncate">{u.name}</p>
                      <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{u.code}</p>
                    </div>
                    <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/8 text-slate-400 shrink-0">
                      {u.projects.length} project{u.projects.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {u.projects.map(p => (
                      <div
                        key={p.id}
                        onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                        className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-100 dark:border-white/6 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-slate-700 dark:text-white truncate">{p.project_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {p.project_code && <span className="text-[9px] font-mono text-slate-400">{p.project_code}</span>}
                            {p.current_phase_name && <span className="text-[9px] text-slate-400 dark:text-slate-500">{p.current_phase_name}</span>}
                          </div>
                        </div>
                        {p.status_label && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded uppercase text-white shrink-0" style={{ backgroundColor: p.status_color || "#64748b" }}>
                            {p.status_label}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "users" ? (
        <div className="space-y-4">
          <label className="relative block w-full max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search name, email, department..."
              className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {usersByDept.map(([dept, members]) => (
            <DepartmentGroup key={dept} dept={dept} count={members.length}>
              {members.map(u => (
                <PersonCard
                  key={u.id}
                  name={u.full_name ?? u.email}
                  email={u.email}
                  jobTitle={u.job_title}
                  isActive={u.is_active}
                  employeeCode={u.employee_code}
                  assignments={assignmentsByPerson.get(u.id) ?? []}
                  router={router}
                />
              ))}
            </DepartmentGroup>
          ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="relative block w-full max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={stakeholderSearch}
              onChange={e => setStakeholderSearch(e.target.value)}
              placeholder="Search name, email, department..."
              className="w-full rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/70 dark:bg-zinc-900/60 pl-8 pr-3 py-2 text-[12px] outline-none text-slate-800 dark:text-white focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {stakeholdersByDept.map(([dept, members]) => (
            <DepartmentGroup key={dept} dept={dept} count={members.length}>
              {members.map(s => (
                <PersonCard
                  key={s.id}
                  name={s.full_name}
                  email={s.email}
                  jobTitle={s.job_title}
                  isActive={s.is_active}
                  employeeCode={s.employee_code}
                  assignments={assignmentsByPerson.get(s.id) ?? []}
                  router={router}
                />
              ))}
            </DepartmentGroup>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
