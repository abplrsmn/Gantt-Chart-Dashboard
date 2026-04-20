const fs = require('fs');
let file = 'src/components/dashboard/CapexGanttMonitor.tsx';
let txt = fs.readFileSync(file, 'utf8');

// 1
txt = txt.replace('import { CalendarRange, Filter, Layers3, Search } from "lucide-react";', 
'import { CalendarRange, Filter, Layers3, Search, ChevronDown, ChevronRight, LayoutList, ListChecks } from "lucide-react";');

// 2
txt = txt.replace('const [selectedProjectId, setSelectedProjectId] = useState<string>("");\n', '');

// 3
txt = txt.replace('const groupedProjects = useMemo(() => {', 
const executionGroupedProjects = useMemo(() => {
    const executionPhases = ["project_management", "handover", "done"];
    const execFiltered = filteredProjects.filter(p => executionPhases.includes(getEffectivePhase(p)));
    
    const grouped = new Map<string, CapexProject[]>();
    for (const project of execFiltered) {
      const hotel = (project.hotelCode || project.unit || "UNKNOWN").toUpperCase();
      const list = grouped.get(hotel) || [];
      list.push(project);
      grouped.set(hotel, list);
    }

    return Array.from(grouped.entries())
      .map(([hotel, items]) => ({
        hotel,
        items: items.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.hotel.localeCompare(b.hotel));
  }, [filteredProjects]);

  const groupedProjects = useMemo(() => {);

// 4
txt = txt.replace(/  const selectedProject = useMemo[\s\S]*?}, \[projects, filteredProjects, selectedProjectId\]\);\n\n/g, '');
txt = txt.replace(/  const selectedNoteItems = useMemo[\s\S]*?\[selectedProject\]\);\n\n/g, '');
txt = txt.replace(/  const activePhaseIndex = useMemo[\s\S]*?\[selectedProject\]\);\n\n/g, '');

// 5 Gantt section
txt = txt.replace('<section className="glass-card p-4 overflow-x-auto">',
\<section className="glass-card p-4 overflow-x-auto relative">
        <div className="absolute top-0 right-0 rounded-bl-xl bg-teal-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5 z-10 border-b border-l border-teal-500/20">
          <LayoutList size={12} /> Execution Phase Only
        </div>\);

txt = txt.replace(/groupedProjects.length === 0/g, 'executionGroupedProjects.length === 0');
txt = txt.replace(/\{groupedProjects.map/g, '{executionGroupedProjects.map');

// 6 Selection logic
txt = txt.replace('const isSelected = selectedProject?.id === project.id;', 'const isSelected = false;');
txt = txt.replace('onClick={() => setSelectedProjectId(project.id)}', '');

fs.writeFileSync(file, txt, 'utf8');
console.log('done Part 1');
