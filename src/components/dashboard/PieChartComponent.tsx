import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { ClickUpTask } from '@/types/clickup';
import { useMemo } from 'react';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartComponentProps {
  tasks: ClickUpTask[];
}

export default function PieChartComponent({ tasks }: PieChartComponentProps) {
  const chartData = useMemo(() => {
    const statusCounts: Record<string, number> = {};
    const statusColors: Record<string, string> = {};

    tasks.forEach(task => {
      const status = task.status.status.toUpperCase();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (!statusColors[status]) {
        statusColors[status] = task.status.color || '#ccc';
      }
    });

    return {
      labels: Object.keys(statusCounts),
      datasets: [
        {
          label: '# of Tasks',
          data: Object.values(statusCounts),
          backgroundColor: Object.keys(statusCounts).map(s => statusColors[s]),
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.2)'
        },
      ],
    };
  }, [tasks]);

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#888'
        }
      }
    }
  };

  if (tasks.length === 0) {
    return <p className="text-gray-500 text-center py-8">No tasks to display.</p>;
  }

  return (
    <div className="w-full flex justify-center p-4">
      <div className="w-full max-w-[250px]">
        <Pie data={chartData} options={options} />
      </div>
    </div>
  );
}
