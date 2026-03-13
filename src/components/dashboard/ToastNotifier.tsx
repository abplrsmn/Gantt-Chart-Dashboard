"use client";

import { useEffect, useRef, useState } from "react";
import { ClickUpTask } from "@/types/clickup";
import toast, { Toaster } from "react-hot-toast";
import { Bell, CheckCircle2, Clock } from "lucide-react";
import { useTheme } from "next-themes";

interface ToastNotifierProps {
  tasks: ClickUpTask[];
}

export default function ToastNotifier({ tasks }: ToastNotifierProps) {
  const prevTasksRef = useRef<Record<string, ClickUpTask>>({});
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const currentTasksMap: Record<string, ClickUpTask> = {};
    tasks.forEach((t) => {
      currentTasksMap[t.id] = t;
    });

    const prevTasks = prevTasksRef.current;

    // Skip the very first render notification storm
    if (Object.keys(prevTasks).length > 0) {
      tasks.forEach((task) => {
        const prevTask = prevTasks[task.id];

        // 1. Task Baru Dibuat
        if (!prevTask) {
          toast(
            (t) => (
              <div className="flex items-start gap-3">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full mt-0.5">
                  <Bell size={18} />
                </div>
                <div>
                  <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">New Task Added</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{task.name}</p>
                  <p className="text-xs font-semibold text-[#18343C] dark:text-[#64A3B4] mt-1">{task.department}</p>
                </div>
              </div>
            ),
            { duration: 5000 }
          );
        } 
        // 2. Status Task Berubah
        else if (prevTask.status.status !== task.status.status) {
          const newStatus = task.status.status.toLowerCase();
          
          if (newStatus === "complete" || newStatus === "closed" || newStatus === "done") {
            toast(
              (t) => (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full mt-0.5">
                    <CheckCircle2 size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">Task Completed! 🎉</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{task.name}</p>
                  </div>
                </div>
              ),
              { duration: 5000 }
            );
          } else if (newStatus === "in progress" || task.status.type === "custom") {
            toast(
              (t) => (
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-[#C29047]/10 text-[#C29047] dark:text-[#E0AD65] rounded-full mt-0.5">
                    <Clock size={18} />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 dark:text-gray-100 text-sm">Status Updated</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">{task.name} is now <b>{task.status.status}</b>.</p>
                  </div>
                </div>
              ),
              { duration: 5000 }
            );
          }
        }
      });
    }

    // Update prev tasks reference
    prevTasksRef.current = currentTasksMap;
  }, [tasks, mounted]);

  if (!mounted) return null;

  return (
    <Toaster 
      position="bottom-right"
      toastOptions={{
        className: 'dark:bg-[#111] dark:text-white dark:border-gray-800 border',
        style: {
          background: theme === 'dark' ? '#161616' : '#fff',
          color: theme === 'dark' ? '#fff' : '#111',
          border: theme === 'dark' ? '1px solid #222' : '1px solid #eaeaea',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          borderRadius: '0.75rem',
          maxWidth: '400px',
        }
      }} 
    />
  );
}
