"use client";

import { ClickUpTask } from '@/types/clickup';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { useTheme } from 'next-themes';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DeptPerformanceChartProps {
  tasks: ClickUpTask[];
}

export default function DeptPerformanceChart({ tasks }: DeptPerformanceChartProps) {
  const { theme } = useTheme();
  
  // Hitung jumlah task per departemen
  const deptCounts: Record<string, number> = {
    Tech: 0,
    Data: 0,
    Digital: 0,
    General: 0,
  };

  let totalMappedTasks = 0;

  tasks.forEach(task => {
    const dept = task.department || 'General';
    if (deptCounts[dept] !== undefined) {
      deptCounts[dept]++;
      totalMappedTasks++;
    } else {
      deptCounts['General']++;
      totalMappedTasks++;
    }
  });

  // Jika belum ada data sama sekali
  if (totalMappedTasks === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center h-[280px]">
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No department data available</p>
      </div>
    );
  }

  // Siapkan data untuk Chart.js (Warna sesuai palette Aryaduta)
  const data = {
    labels: ['Tech', 'Data', 'Digital', 'General'],
    datasets: [
      {
        data: [deptCounts.Tech, deptCounts.Data, deptCounts.Digital, deptCounts.General],
        backgroundColor: [
          '#C29047', // Gold / Tech
          '#18343C', // Dark Green / Data
          '#3B82F6', // Blue / Digital
          '#9CA3AF'  // Gray / General
        ],
        hoverBackgroundColor: [
          '#E0AD65',
          '#244C57',
          '#60A5FA',
          '#D1D5DB'
        ],
        borderWidth: 0,
        hoverOffset: 4
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '75%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: theme === 'dark' ? '#D1D5DB' : '#374151',
          padding: 20,
          font: {
            family: "'Geist', sans-serif",
            weight: 600,
            size: 12
          },
          usePointStyle: true,
          pointStyle: 'circle'
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const value = context.raw || 0;
            const percentage = Math.round((value / totalMappedTasks) * 100);
            return ` ${context.label}: ${value} Tasks (${percentage}%)`;
          }
        },
        backgroundColor: theme === 'dark' ? '#222' : '#fff',
        titleColor: theme === 'dark' ? '#fff' : '#111',
        bodyColor: theme === 'dark' ? '#ccc' : '#444',
        borderColor: theme === 'dark' ? '#333' : '#e5e7eb',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
      }
    }
  };

  return (
    <div className="relative w-full h-[280px] flex items-center justify-center">
      <Doughnut data={data} options={options} />
      {/* Teks di tengah Doughnut */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-[-30px]">
        <span className="text-3xl font-black text-gray-900 dark:text-white leading-none">
          {totalMappedTasks}
        </span>
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-1">
          Total
        </span>
      </div>
    </div>
  );
}
