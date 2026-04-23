"use client";

import { useEffect, useState } from "react";
import { Users, ArrowLeft, Mail, Loader2, ListTodo, FolderKanban, CalendarClock } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

type Member = {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  color: string;
};

type TeamTask = {
  id: string;
  name: string;
  status: string;
  dueDate: string | null;
  url: string;
  assignees: string[];
};

type TeamList = {
  id: string;
  name: string;
  totalTasks: number;
  openTasks: number;
  closedTasks: number;
  tasks: TeamTask[];
};

type TeamListsPayload = {
  folder: { id: string; name: string } | null;
  lists: TeamList[];
};

const TASKS_PER_PAGE = 10;

export default function TeamDetailsPage() {
  const params = useParams();
  const teamName = params.teamName as string;
  const decodedTeamName = teamName ? decodeURIComponent(teamName) : "";

  const [members, setMembers] = useState<Member[]>([]);
  const [teamLists, setTeamLists] = useState<TeamList[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [listPages, setListPages] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMembers() {
      if (!decodedTeamName) return;
      try {
        setLoading(true);
        const [membersRes, listsRes] = await Promise.all([
          fetch(`/api/clickup/team-members/${decodedTeamName}`),
          fetch(`/api/clickup/team-lists/${decodedTeamName}`),
        ]);

        const membersData = await membersRes.json();
        const listsData = await listsRes.json();

        if (membersData.success) {
          setMembers(Array.isArray(membersData.data) ? membersData.data : []);
        } else {
          console.error("Failed to fetch members:", membersData.error);
          setMembers([]);
        }

        if (listsData.success) {
          const payload = listsData.data as TeamListsPayload;
          setFolderName(payload?.folder?.name || "");
          const nextLists = Array.isArray(payload?.lists) ? payload.lists : [];
          setTeamLists(nextLists);
          setListPages((prev) => {
            const updated: Record<string, number> = {};
            for (const list of nextLists) {
              const totalPages = Math.max(1, Math.ceil(list.tasks.length / TASKS_PER_PAGE));
              const current = prev[list.id] || 1;
              updated[list.id] = Math.min(current, totalPages);
            }
            return updated;
          });
        } else {
          console.error("Failed to fetch team lists:", listsData.error);
          setFolderName("");
          setTeamLists([]);
          setListPages({});
        }
      } catch (error) {
        console.error("Error fetching members:", error);
        setMembers([]);
        setFolderName("");
        setTeamLists([]);
        setListPages({});
      } finally {
        setLoading(false);
      }
    }

    fetchMembers();

    return () => {};
  }, [decodedTeamName]);

  return (
    <div className="space-y-6 pb-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/team" className="p-2 rounded-lg bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-800 transition-colors shadow-sm shrink-0 self-center">
          <ArrowLeft size={18} className="text-slate-600 dark:text-gray-300" />
        </Link>
        <div className="flex flex-col justify-center">
          <p className="text-sm font-semibold text-slate-600 dark:text-gray-300 leading-none">Team Members & Access List</p>
        </div>
      </div>
      
      <div className="glass-card p-6 relative overflow-hidden min-h-[300px]">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full pt-12">
            <Loader2 size={32} className="text-blue-500 animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-500 dark:text-gray-400">Syncing live team data...</p>
          </div>
        ) : members.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((member) => (
              <div key={member.id} className="p-4 bg-white/40 dark:bg-zinc-800/40 rounded-xl border border-slate-200/60 dark:border-zinc-700/60 flex items-center gap-4">
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-sm"
                  style={{ backgroundColor: member.color || '#3B82F6' }}
                >
                  {member.initials}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100 truncate">{member.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1 text-slate-500 dark:text-gray-400">
                    <Mail size={10} />
                    <p className="text-xs truncate" title={member.email}>{member.email || 'No email'}</p>
                  </div>
                  
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-4 text-slate-400">
              <Users size={28} />
            </div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-gray-200 mb-1">No members found</h3>
            <p className="text-xs text-slate-500 dark:text-gray-400 max-w-xs">
              There are no members listed for the {decodedTeamName} team yet, or the data has not been synced.
            </p>
          </div>
        )}
      </div>

      <div className="glass-card p-6 relative overflow-hidden">
        <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-200/60 dark:border-slate-700/50 pb-3">
          <div className="flex items-center gap-2">
            <FolderKanban size={16} className="text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-gray-100">
              Task Lists in {folderName || decodedTeamName}
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {teamLists.length} list{teamLists.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-3">
            <Loader2 size={16} className="animate-spin" />
            Loading team lists...
          </div>
        ) : teamLists.length > 0 ? (
          <div className="space-y-3">
            {teamLists.map((list) => {
              const totalPages = Math.max(1, Math.ceil(list.tasks.length / TASKS_PER_PAGE));
              const currentPage = Math.min(listPages[list.id] || 1, totalPages);
              const start = (currentPage - 1) * TASKS_PER_PAGE;
              const end = start + TASKS_PER_PAGE;
              const pagedTasks = list.tasks.slice(start, end);

              return (
                <details key={list.id} className="rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white/50 dark:bg-zinc-900/30 p-4">
                  <summary className="list-none cursor-pointer flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <ListTodo size={14} className="text-indigo-500 shrink-0" />
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{list.name}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-medium">
                      <span className="px-2 py-1 rounded-md bg-slate-100 text-slate-700 dark:bg-zinc-800 dark:text-slate-200">{list.totalTasks} total</span>
                      <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{list.openTasks} open</span>
                      <span className="px-2 py-1 rounded-md bg-slate-200 text-slate-700 dark:bg-zinc-700 dark:text-slate-200">{list.closedTasks} closed</span>
                    </div>
                  </summary>

                  <div className="mt-3 space-y-2">
                    {list.tasks.length > 0 ? (
                      pagedTasks.map((task) => (
                        <div key={task.id} className="rounded-lg border border-slate-200/70 dark:border-slate-700/70 bg-white dark:bg-zinc-900 p-3">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <a
                              href={task.url || undefined}
                              target={task.url ? "_blank" : undefined}
                              rel={task.url ? "noopener noreferrer" : undefined}
                              className="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {task.name}
                            </a>
                            <span className="text-[11px] px-2 py-1 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 w-fit">
                              {task.status}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1">
                              <Users size={12} />
                              {task.assignees.length > 0 ? task.assignees.join(", ") : "Unassigned"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock size={12} />
                              {task.dueDate ? new Date(Number(task.dueDate)).toLocaleDateString() : "No due date"}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">No tasks found in this list.</p>
                    )}

                    {list.tasks.length > TASKS_PER_PAGE && (
                      <div className="pt-1 flex items-center justify-between gap-3">
                        <p className="text-[11px] text-slate-400">
                          Showing {start + 1}-{Math.min(end, list.tasks.length)} of {list.tasks.length} tasks
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setListPages((prev) => ({
                              ...prev,
                              [list.id]: Math.max(1, currentPage - 1),
                            }))}
                            disabled={currentPage <= 1}
                            className="px-2.5 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Previous
                          </button>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {currentPage}/{totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setListPages((prev) => ({
                              ...prev,
                              [list.id]: Math.min(totalPages, currentPage + 1),
                            }))}
                            disabled={currentPage >= totalPages}
                            className="px-2.5 py-1 text-[11px] rounded-md border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
            No lists found for this team folder.
          </p>
        )}
      </div>
    </div>
  );
}
