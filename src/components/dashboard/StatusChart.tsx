import { ClickUpTask } from '@/types/clickup';

interface StatusChartProps {
  tasks: ClickUpTask[];
}

export default function StatusChart({ tasks }: StatusChartProps) {
  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
        <p className="text-gray-400 dark:text-gray-500 text-sm">No data available</p>
      </div>
    );
  }

  const statusCounts: Record<string, { count: number; color: string }> = {};
  
  tasks.forEach(task => {
    const sName = task.status.status.toUpperCase();
    const sColor = task.status.color || '#ccc';
    
    if (!statusCounts[sName]) {
      statusCounts[sName] = { count: 0, color: sColor };
    }
    statusCounts[sName].count++;
  });

  const totalTasks = tasks.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end gap-2 mb-2">
        <span className="text-4xl font-black text-gray-900 dark:text-white leading-none">{totalTasks}</span>
        <span className="text-sm font-medium text-gray-500 dark:text-gray-400 pb-1">Total Tasks</span>
      </div>

      <div className="w-full h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
        {Object.entries(statusCounts).map(([statusName, data]) => (
          <div 
            key={`bar-${statusName}`}
            style={{ 
              width: `${(data.count / totalTasks) * 100}%`,
              backgroundColor: data.color 
            }}
            className="h-full transition-all duration-500"
            title={`${statusName}: ${data.count}`}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 mt-2">
        {Object.entries(statusCounts).map(([statusName, data]) => (
          <div key={statusName} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800/50">
            <div className="flex items-center gap-3">
              <div 
                className="w-3.5 h-3.5 rounded-full shadow-sm"
                style={{ backgroundColor: data.color }}
              />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{statusName}</span>
            </div>
            <span className="text-sm font-bold bg-white dark:bg-[#222] px-2.5 py-0.5 rounded-md text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 shadow-sm">
              {data.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
