const fs = require('fs');

let content = fs.readFileSync('src/components/dashboard/CapexGanttMonitor.tsx', 'utf8');

// 1. Add Lucide imports
content = content.replace(
  'import { CalendarRange, Filter, Layers3, Search } from "lucide-react";',
  'import { CalendarRange, Filter, Layers3, Search, ChevronDown, ChevronRight, LayoutList, ListChecks } from "lucide-react";'
);

// 2. Remove selectedProjectId state
content = content.replace(
  '  const [selectedProjectId, setSelectedProjectId] = useState<string>("");\n',
  ''
);

// 3. Create executionGroupedProjects below groupedProjects
const groupedProjectsRegex = /const groupedProjects = useMemo\(\(\) => \{[\s\S]*?\}, \[filteredProjects\]\);/;
const executionGroupedProjectsText = 
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
;
content = content.replace(groupedProjectsRegex, match => match + "\n" + executionGroupedProjectsText);

// 4. Remove selectedProject and selectedNoteItems, activePhaseIndex
content = content.replace(/  const selectedProject = useMemo\(\(\) => \{[\s\S]*?\}, \[projects, filteredProjects, selectedProjectId\]\);\n\n/g, '');
content = content.replace(/  const selectedNoteItems = useMemo\(\(\) => splitTaskNote\(selectedProject\?\.note\), \[selectedProject\]\);\n\n/g, '');
content = content.replace(/  const activePhaseIndex = useMemo\(\(\) => \{[\s\S]*?\}, \[selectedProject\]\);\n\n/g, '');

// 5. Update Gantt section
const ganttSectionRegex = /<section className="glass-card p-4 overflow-x-auto">/;
content = content.replace(
  ganttSectionRegex,
  <section className="glass-card p-4 overflow-x-auto relative">
        <div className="absolute top-0 right-0 rounded-bl-xl bg-teal-500/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5 z-10 border-b border-l border-teal-500/20">
          <LayoutList size={12} /> Execution Phase Only
        </div>
);

content = content.replace(
  /groupedProjects\.length === 0/g,
  'executionGroupedProjects.length === 0'
);

content = content.replace(
  /\{groupedProjects\.map\(\(group\) => \(/g,
  '{executionGroupedProjects.map((group) => ('
);

// Update isSelected logic
content = content.replace(
  /const isSelected = selectedProject\?\.id === project\.id;/g,
  'const isSelected = false;'
);

content = content.replace(
  /onClick=\{\(\) => setSelectedProjectId\(project\.id\)\}/g,
  ''
);

// 6. Replace the entire {selectedProject && ...} section at the bottom up to the end with PhaseCards
const selectedProjectSectionRegex = /      \{selectedProject && \([\s\S]*?\)\}\n    <\/div>\n  \);\n\}\n\nfunction MiniInfo[\s\S]*?\}\n/g;

const phaseCardsCode = 
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-cyan-600" />
            <h3 className="text-base font-bold text-slate-800 dark:text-white">Phase Monitoring Matrix</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Full view of all projects by execution phase
          </p>
        </div>
        
        <div className="space-y-3">
          {PHASE_ORDER.concat(["blocked"] as any).map(phase => {
            const phaseProjects = filteredProjects.filter(p => getEffectivePhase(p) === phase);
            return (
              <PhaseGroupCard 
                key={phase}
                phase={phase as any}
                title={getPhaseLabel(phase as any)}
                projects={phaseProjects}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PhaseGroupCard({ phase, title, projects }: { phase: CapexPhase | "blocked", title: string, projects: CapexProject[] }) {
  const [expanded, setExpanded] = useState(false);

  if (projects.length === 0) return null;

  const previewNames = projects.slice(0, 3).map(p => p.name).join(", ") + (projects.length > 3 ? "..." : "");
  const tone = getPhaseTone(phase as any);

  return (
    <div className="glass-card overflow-hidden flex flex-col">
      <button 
        type="button"
        onClick={() => setExpanded(!expanded)} 
        className="flex items-center justify-between px-4 py-3 bg-white/40 dark:bg-zinc-900/40 hover:bg-white/60 dark:hover:bg-zinc-900/60 transition-colors text-left w-full"
      >
        <div className="flex items-center gap-3 overflow-hidden pr-4 flex-1">
          <span className={\shrink-0 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold \\}>
            {title} ({projects.length})
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-full hidden md:block">
            {previewNames}
          </span>
        </div>
        <div className="shrink-0 text-slate-400">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </button>

      {expanded && (
        <div className="p-0 overflow-x-auto border-t border-slate-200/70 dark:border-white/10 bg-white/30 dark:bg-black/20">
          <table className="w-full text-left text-[10px] sm:text-[11px] whitespace-nowrap">
            <thead className="bg-slate-100/70 dark:bg-white/5 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5 font-semibold sticky left-0 bg-slate-100 dark:bg-zinc-900 z-10 shadow-[1px_0_0_rgba(0,0,0,0.1)] dark:shadow-[1px_0_0_rgba(255,255,255,0.1)]">Unit</th>
                <th className="px-3 py-2.5 font-semibold max-w-[200px] truncate">Description</th>
                <th className="px-3 py-2.5 font-semibold">Op. Brief / PR</th>
                <th className="px-3 py-2.5 font-semibold">Received Date</th>
                <th className="px-3 py-2.5 font-semibold">Budget/CAPEX</th>
                <th className="px-3 py-2.5 font-semibold">Start Design Date</th>
                <th className="px-3 py-2.5 font-semibold">Design Approval</th>
                <th className="px-3 py-2.5 font-semibold">Tender Start</th>
                <th className="px-3 py-2.5 font-semibold">APS/SPK Released</th>
                <th className="px-3 py-2.5 font-semibold">Contract Amount</th>
                <th className="px-3 py-2.5 font-semibold">Commence Date</th>
                <th className="px-3 py-2.5 font-semibold">End Contract</th>
                <th className="px-3 py-2.5 font-semibold">Actual Completion</th>
                <th className="px-3 py-2.5 font-semibold">Deviation</th>
                <th className="px-3 py-2.5 font-semibold">Current Site Progress</th>
                <th className="px-3 py-2.5 font-semibold">Remarks</th>
                <th className="px-3 py-2.5 font-semibold">BAST-1</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 dark:divide-white/5">
              {projects.map(proj => {
                const notes = splitTaskNote(proj.note);
                const getVal = (keys: string[]) => {
                  const lowerKeys = keys.map(k => k.toLowerCase());
                  const found = notes.find(n => lowerKeys.includes(n.label.toLowerCase()));
                  return found ? found.value : "-";
                };

                const unit = (proj.hotelCode || proj.unit || "UNKNOWN").toUpperCase();
                const desc = proj.name;
                const pr = proj.milestones?.briefDate || getVal(["Operational Brief", "Operational Brief Date", "Brief Date", "PR Date"]);
                const received = getVal(["Received Date"]);
                
                let budgetRaw = getVal(["Budget / CAPEX", "Budget", "CAPEX"]);
                if (budgetRaw !== "-" && !budgetRaw.toLowerCase().includes("rp")) {
                  const num = Number(budgetRaw.replace(/[^\\d]/g, ""));
                  budgetRaw = !isNaN(num) && num > 0 ? \Rp \\ : budgetRaw;
                }

                const startDesign = proj.milestones?.designDate || getVal(["Start Design Date"]);
                const designApp = getVal(["Design Approval", "Design Approval Date"]);
                const tenderStart = getVal(["Tender Start"]);
                const aps = proj.milestones?.controlDate || getVal(["APS Release Date", "APS SPK Released"]);
                
                let contractAmtRaw = getVal(["Contract Amount"]);
                if (contractAmtRaw !== "-" && !contractAmtRaw.toLowerCase().includes("rp")) {
                  const num = Number(contractAmtRaw.replace(/[^\\d]/g, ""));
                  contractAmtRaw = !isNaN(num) && num > 0 ? \Rp \\ : contractAmtRaw;
                }

                const commence = proj.milestones?.projectManagementDate || getVal(["Commence Date"]);
                const endContact = proj.end || getVal(["End Contract"]);
                const actualComp = proj.milestones?.handoverDate || getVal(["Actual Completion"]);
                let deviation = getVal(["Deviation Days", "Deviation"]);
                if (deviation === "-" && proj.deadlineRisk === "overdue") deviation = "Overdue";
                
                const siteText = getVal(["Current Site", "Current Site Progress"]);
                let siteProg = siteText;
                if (typeof proj.progress === "number") {
                  siteProg = siteText !== "-" ? \\% - \\ : \\%\;
                }

                const remarksRaw = getVal(["PROGRESS & NOTES", "Status Note", "Project Status Note", "Remarks"]);
                const remarks = remarksRaw !== "-" ? remarksRaw : (proj.nextAction || "-");
                const bast1 = getVal(["BAST-1"]);

                return (
                  <tr key={proj.id} className="hover:bg-slate-50/80 dark:hover:bg-white/5 transition-colors">
                    <td className="px-3 py-2 font-bold text-slate-800 dark:text-slate-200 sticky left-0 bg-slate-50/90 dark:bg-zinc-800/90 z-10 shadow-[1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[1px_0_0_rgba(255,255,255,0.05)] backdrop-blur">{unit}</td>
                    <td className="px-3 py-2 max-w-[250px] truncate text-slate-800 dark:text-slate-100" title={desc}>{desc}</td>
                    <td className="px-3 py-2">{pr}</td>
                    <td className="px-3 py-2">{received}</td>
                    <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-medium">{budgetRaw}</td>
                    <td className="px-3 py-2">{startDesign}</td>
                    <td className="px-3 py-2">{designApp}</td>
                    <td className="px-3 py-2">{tenderStart}</td>
                    <td className="px-3 py-2">{aps}</td>
                    <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400 font-medium">{contractAmtRaw}</td>
                    <td className="px-3 py-2">{commence}</td>
                    <td className="px-3 py-2">{endContact}</td>
                    <td className="px-3 py-2">{actualComp}</td>
                    <td className="px-3 py-2 font-medium">{deviation}</td>
                    <td className="px-3 py-2 max-w-[150px] truncate" title={siteProg}>{siteProg}</td>
                    <td className="px-3 py-2 max-w-[250px] truncate whitespace-normal leading-snug" title={remarks}>
                       <span className="line-clamp-2">{remarks}</span>
                    </td>
                    <td className="px-3 py-2">{bast1}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
;

content = content.replace(selectedProjectSectionRegex, phaseCardsCode);

fs.writeFileSync('src/components/dashboard/CapexGanttMonitor.tsx', content, 'utf8');
