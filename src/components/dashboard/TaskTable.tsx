import { ClickUpTask } from '@/types/clickup';

interface TaskTableProps {
  tasks: ClickUpTask[];
}

export default function TaskTable({ tasks, hideStatus }: TaskTableProps & { hideStatus?: boolean }) {
  if (!tasks || tasks.length === 0) {
    return <p className="text-gray-500 py-4">No tasks found in this workspace.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3">Task Name</th>
            <th scope="col" className="px-6 py-3">List</th>
            {!hideStatus && <th scope="col" className="px-6 py-3">Status</th>}
            <th scope="col" className="px-6 py-3">Assignee</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className="bg-white border-b hover:bg-gray-50">
              <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                <a href={task.url} target="_blank" rel="noopener noreferrer" className="hover:underline hover:text-blue-600">
                  {task.name}
                </a>
              </td>
              {!hideStatus && (
              <td className="px-6 py-4">
                <span 
                  className="px-2 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: task.status.color || '#ccc' }}
                >
                  {task.status.status.toUpperCase()}
                </span>
              </td>
            )}
              <td className="px-6 py-4">
                {task.assignees.length > 0 ? (
                  <div className="flex -space-x-2 overflow-hidden">
                    {task.assignees.map((assignee) => (
                      <div 
                        key={assignee.id} 
                        className="inline-block w-8 h-8 rounded-full border-2 border-white text-center leading-7 text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: assignee.color || '#999' }}
                        title={assignee.username}
                      >
                        {assignee.initials}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">Unassigned</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
