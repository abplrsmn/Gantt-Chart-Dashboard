import { ClickUpTask } from '@/types/clickup';
import { CheckCircle2, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CompletedTasksProps {
  tasks: ClickUpTask[];
}

export default function CompletedTasks({ tasks }: CompletedTasksProps) {
  const completedTasks = tasks.filter(t => 
    t.status.type === 'closed' || 
    t.status.status.toLowerCase() === 'complete' ||
    t.status.status.toLowerCase() === 'done' ||
    t.status.status.toLowerCase() === 'closed'
  );

  if (!completedTasks || completedTasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-50/50 dark:bg-[#111] rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">No completed tasks yet</p>
      </div>
    );
  }

  // Sort by date_closed (descending) if available, else date_updated
  const sortedTasks = [...completedTasks].sort((a, b) => {
    const timeA = parseInt(a.date_closed || a.date_updated || '0');
    const timeB = parseInt(b.date_closed || b.date_updated || '0');
    return timeB - timeA;
  });

  return (
    <div className="flex flex-col gap-3 max-h-[320px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-800">
      {sortedTasks.map(task => {
        const timestamp = parseInt(task.date_closed || task.date_updated || '0');
        const timeAgo = timestamp ? formatDistanceToNow(new Date(timestamp), { addSuffix: true }) : 'Unknown time';

        return (
          <div key={task.id} className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-[#111] hover:bg-gray-100 dark:hover:bg-[#161616] rounded-xl border border-gray-200/60 dark:border-gray-800 transition-colors group">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="p-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-full flex-shrink-0">
                <CheckCircle2 size={16} />
              </div>
              <div className="flex flex-col overflow-hidden">
                <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gray-700 dark:text-gray-300 line-clamp-1 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {task.name}
                </a>
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-500">
                  {task.department || 'General'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap ml-4">
              <Clock size={12} />
              {timeAgo}
            </div>
          </div>
        );
      })}
    </div>
  );
}
