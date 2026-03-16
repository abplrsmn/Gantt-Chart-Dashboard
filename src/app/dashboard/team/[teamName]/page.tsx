"use client";

import { useEffect, useState } from "react";
import { Users, ArrowLeft, Mail, Briefcase, Loader2 } from "lucide-react";
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

export default function TeamDetailsPage() {
  const params = useParams();
  const teamName = params.teamName as string;
  const decodedTeamName = teamName ? decodeURIComponent(teamName) : "";

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMembers() {
      if (!decodedTeamName) return;
      try {
        setLoading(true);
        const res = await fetch(`/api/clickup/team-members/${decodedTeamName}`);
        const data = await res.json();
        if (data.success) {
          setMembers(data.data);
        } else {
          console.error("Failed to fetch members:", data.error);
        }
      } catch (error) {
        console.error("Error fetching members:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchMembers();
    
    // Optional: Refresh every 30 seconds for "real-time" feel
    const interval = setInterval(fetchMembers, 30000);
    return () => clearInterval(interval);
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
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500 rounded-t-2xl"></div>
        
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
                    <p className="text-[10px] truncate" title={member.email}>{member.email || 'No email'}</p>
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
    </div>
  );
}
