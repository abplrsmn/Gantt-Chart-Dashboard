'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TaskTable from './TaskTable';
import StatusChart from './StatusChart';
import DivisionChart from './DivisionChart';
import PieChartComponent from './PieChartComponent';
import { ClickUpTask } from '@/types/clickup';
import { 
  Users, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  LayoutDashboard 
} from 'lucide-react';

interface DashboardClientProps {
  tasks: ClickUpTask[];
}

export default function DashboardClient({ tasks }: DashboardClientProps) {
  const [selectedDivision, setSelectedDivision] = useState<string>('All');

  // KPI Calculations
  const activeTasks = useMemo(() => {
    return tasks.filter(t => t.status.status.toLowerCase() !== 'closed' && t.status.status.toLowerCase() !== 'completed').length;
  }, [tasks]);

  const overdueTasks = useMemo(() => {
    const now = new Date().getTime();
    return tasks.filter(t => {
      const isCompleted = t.status.status.toLowerCase() === 'closed' || t.status.status.toLowerCase() === 'completed';
      if (isCompleted || !t.due_date) return false;
      return parseInt(t.due_date) < now;
    }).length;
  }, [tasks]);

  const totalEmployees = useMemo(() => {
    const uniqueEmployees = new Set<number>();
    tasks.forEach(t => {
      t.assignees.forEach(a => uniqueEmployees.add(a.id));
    });
    return uniqueEmployees.size;
  }, [tasks]);

  const completedTasksHistory = useMemo(() => {
    return tasks.filter(t => t.status.status.toLowerCase() === 'closed' || t.status.status.toLowerCase() === 'completed')
      .sort((a, b) => parseInt(b.date_closed || b.date_created || '0') - parseInt(a.date_closed || a.date_created || '0'));
  }, [tasks]);

  // Extract unique divisions from tasks (list.name)
  const divisions = useMemo(() => {
    const divs = new Set<string>();
    tasks.forEach((task) => {
      divs.add(task.list?.name || 'Other');
    });
    return ['All', ...Array.from(divs)];
  }, [tasks]);

  // Filter tasks based on selected division
  const filteredTasks = useMemo(() => {
    if (selectedDivision === 'All') return tasks;
    return tasks.filter((task) => {
      const divName = task.list?.name || 'Other';
      return divName === selectedDivision;
    });
  }, [tasks, selectedDivision]);

  return (
    <main className="p-8 space-y-8 min-h-screen bg-gray-100">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
          <LayoutDashboard className="w-8 h-8 text-blue-600" />
          Project Dashboard
        </h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4"
        >
          <div className="p-4 bg-blue-100 rounded-full text-blue-600">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Active Tasks</p>
            <p className="text-2xl font-bold text-gray-800">{activeTasks}</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4"
        >
          <div className="p-4 bg-red-100 rounded-full text-red-600">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Overdue Tasks</p>
            <p className="text-2xl font-bold text-gray-800">{overdueTasks}</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4"
        >
          <div className="p-4 bg-purple-100 rounded-full text-purple-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-500">Total Employees</p>
            <p className="text-2xl font-bold text-gray-800">{totalEmployees}</p>
          </div>
        </motion.div>
      </div>
      
      {/* Division/Department Filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {divisions.map((div) => {
          const isActive = selectedDivision === div;
          return (
            <motion.button
              key={div}
              onClick={() => setSelectedDivision(div)}
              className={`relative px-4 py-2 rounded-full text-sm font-medium transition-colors duration-300 ${
                isActive 
                  ? 'text-white bg-blue-600' 
                  : 'text-gray-600 bg-white hover:bg-gray-100 shadow-sm border border-gray-200'
              }`}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {div}
              {isActive && (
                <motion.div
                  layoutId="activeFilter"
                  className="absolute inset-0 bg-blue-600 rounded-full -z-10"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <motion.div 
            layout
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-700">
              {selectedDivision === 'All' ? 'All Tasks' : `${selectedDivision} Tasks`}
            </h2>
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDivision + '-table'}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <TaskTable tasks={filteredTasks} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
          
          <motion.div 
            layout
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Tasks by Division</h2>
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedDivision + '-division'}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.4 }}
              >
                <DivisionChart tasks={filteredTasks} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
        
        <div className="space-y-8">
          <motion.div 
            layout
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Task Status (Pie Chart)</h2>
            <AnimatePresence mode="wait">
               <motion.div
                  key={selectedDivision + '-pie'}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                <PieChartComponent tasks={filteredTasks} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
          
          <motion.div 
            layout
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-200"
          >
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Task Status</h2>
            <AnimatePresence mode="wait">
               <motion.div
                  key={selectedDivision + '-status'}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                <StatusChart tasks={filteredTasks} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* Completed Task History */}
      <motion.div 
        layout
        className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mt-8"
      >
        <h2 className="text-xl font-semibold mb-4 text-gray-700 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-green-500" />
          Completed Task History
        </h2>
        <div className="max-h-[400px] overflow-y-auto pr-2">
          <TaskTable tasks={completedTasksHistory} hideStatus />
        </div>
      </motion.div>
    </main>
  );
}
