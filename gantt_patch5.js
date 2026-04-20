const fs = require('fs');
let code = fs.readFileSync('src/components/dashboard/CapexGanttMonitor.tsx', 'utf8');

const importReplacement = `import { CalendarRange, Filter, Layers3, Search, ChevronDown, ChevronRight, LayoutList, ListChecks, Folder } from "lucide-react";`;
code = code.replace(/import \{ CalendarRange, Filter, Layers3, Search, ChevronDown, ChevronRight, LayoutList, ListChecks \} from "lucide-react";/, importReplacement);

// Add activePhaseTab state
code = code.replace(
  /const \[simpleMode, setSimpleMode\] = useState\(true\);/,
  `const [simpleMode, setSimpleMode] = useState(true);\n  const [activePhaseTab, setActivePhaseTab] = useState<CapexPhase | "blocked">("project_management");`
);

// Add GANTT_RESTRICTED_PROJECTS constant at the top
code = code.replace(
  /type GanttRow = \{/,
  `// TODO: Masukkan 13 nama project atau 13 Task ID dari file "gantt chart.xlsx" ke dalam array ini
// agar Gantt Chart HANYA memunculkan ke-13 project tersebut.
// Contoh: ["Perbaikan Atap Monas", "Room Renovation", "3xyz123"]
const GANTT_RESTRICTED_PROJECTS: string[] = [];

type GanttRow = {`
);

// Replace filteredProjects map inside executionGroupedProjects
code = code.replace(
  /filteredProjects\.filter\(\(project\) => \{\s*const phase = getEffectivePhase\(project\);\s*return \["project_management", "handover", "done"\]\.includes\(phase\);\s*\}\)/,
  `filteredProjects.filter((project) => {
        if (GANTT_RESTRICTED_PROJECTS.length > 0) {
          const isTarget = GANTT_RESTRICTED_PROJECTS.some(idOrName => 
            project.id === idOrName || project.name.toLowerCase().includes(idOrName.toLowerCase())
          );
          if (isTarget) return true;
          return false;
        }
        const phase = getEffectivePhase(project);
        return ["project_management", "handover", "done"].includes(phase);
      })`
);

// Replace Matrix List mapping with Tabs
const oldMatrixListRegex = /<section className="space-y-4">[\s\S]*?<\/div>[\s\S]*?<\/section>/;

const newTabsCode = `<section className="mt-8 space-y-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-2 border-b border-slate-200/70 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Folder size={18} className="text-cyan-600" />
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">Phase Monitoring Matrix</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Full Excel-structural view by Project Phase
          </p>
        </div>
        
        {/* TAB BUTTONS (Like Folders) */}
        <div className="flex flex-wrap gap-1 px-1">
          {((PHASE_ORDER as Array<CapexPhase | "blocked">).concat(["blocked"])).map(phase => {
            const phaseProjects = filteredProjects.filter(p => getEffectivePhase(p) === phase);
            if (phaseProjects.length === 0) return null;
            
            const isActive = activePhaseTab === phase;
            const tone = isActive ? getPhaseTone(phase as any) : "text-slate-500 bg-slate-200/50 dark:text-slate-400 dark:bg-white/5";
            
            return (
              <button
                key={phase}
                onClick={() => setActivePhaseTab(phase)}
                className={\`relative px-5 pt-3 pb-2.5 rounded-t-xl text-[13px] font-bold tracking-wide transition-all border border-b-0
                  \$\{isActive 
                    ? "bg-slate-100 lg:bg-white dark:bg-zinc-800 text-slate-900 dark:text-white border-slate-300/80 dark:border-white/20 z-10 translate-y-[2px]" 
                    : "bg-slate-50/50 dark:bg-zinc-900/50 text-slate-500 dark:text-slate-400 border-slate-200/60 dark:border-white/5 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }\`}
              >
                <div className="flex items-center gap-3">
                  <span>{getPhaseLabel(phase)}</span>
                  <span className={\`px-2 py-0.5 rounded-full text-[11px] font-extrabold \$\{tone\}\`}>
                    {phaseProjects.length}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* TAB CONTENT */}
        <div className="relative z-0 bg-slate-100 lg:bg-white dark:bg-zinc-800 rounded-b-xl rounded-tr-xl border border-slate-300/80 dark:border-white/20 shadow-md p-4 min-h-[400px]">
          <PhaseTable 
            phase={activePhaseTab} 
            title={getPhaseLabel(activePhaseTab)} 
            projects={filteredProjects.filter(p => getEffectivePhase(p) === activePhaseTab)} 
          />
        </div>
      </section>`;

code = code.replace(oldMatrixListRegex, newTabsCode);

// Replace PhaseGroupCard with PhaseTable
const phaseCardStart = code.lastIndexOf('function PhaseGroupCard');
const newPhaseTable = `function PhaseTable({ phase, title, projects }: { phase: CapexPhase | "blocked", title: string, projects: CapexProject[] }) {
  if (projects.length === 0) {
    return (
      <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center">
         <Folder size={32} className="mb-3 text-slate-300 dark:text-zinc-600" />
         <p>No projects currently in <strong>{title}</strong> phase.</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200/70 dark:border-white/10 bg-white/40 dark:bg-black/20">
      <table className="w-full text-left text-[10.5px] sm:text-[11px] whitespace-nowrap">
        <thead className="bg-slate-200/50 dark:bg-white/10 text-slate-600 dark:text-slate-300 border-b border-slate-300/60 dark:border-white/10">
          <tr>
            <th className="px-4 py-3 font-bold sticky left-0 bg-slate-200/90 dark:bg-[#202024]/90 z-10 backdrop-blur">Unit</th>
            <th className="px-4 py-3 font-bold max-w-[200px] truncate">Description</th>
            <th className="px-4 py-3 font-bold">Op. Brief / PR</th>
            <th className="px-4 py-3 font-bold">Received Date</th>
            <th className="px-4 py-3 font-bold">Budget/CAPEX</th>
            <th className="px-4 py-3 font-bold">Start Design Date</th>
            <th className="px-4 py-3 font-bold">Design Approval</th>
            <th className="px-4 py-3 font-bold">Tender Start</th>
            <th className="px-4 py-3 font-bold">APS/SPK Released</th>
            <th className="px-4 py-3 font-bold">Contract Amount</th>
            <th className="px-4 py-3 font-bold">Commence Date</th>
            <th className="px-4 py-3 font-bold">End Contract</th>
            <th className="px-4 py-3 font-bold">Actual Completion</th>
            <th className="px-4 py-3 font-bold">Deviation</th>
            <th className="px-4 py-3 font-bold">Current Site Progress</th>
            <th className="px-4 py-3 font-bold">Remarks</th>
            <th className="px-4 py-3 font-bold">BAST-1</th>
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
            const budget = getVal(["Budget/CAPEX", "Budget", "Capex Budget"]);
            const startDesign = proj.milestones?.designDate || getVal(["Start Design Date", "Design Start"]);
            const approval = getVal(["Design Approval", "Approval Date"]);
            const tender = getVal(["Tender Start", "Tender Date", "Tender"]);
            const aps = getVal(["APS/SPK Released", "APS Release Date", "SPK Release Date", "APS"]);
            const contractAmtRaw = getVal(["Contract Amount", "Contract Amt", "Amount"]);
            const commence = proj.milestones?.projectManagementDate || getVal(["Commence Date", "Commence"]);
            const endContact = proj.milestones?.handoverDate || getVal(["End Contract", "End Date"]);
            const actualComp = getVal(["Actual Completion", "Completion Date", "Actual Comp"]);
            const deviation = getVal(["Deviation", "Dev Days"]);
            const siteProg = getVal(["Current Site Progress", "Site Progress", "Progress"]);
            const remarks = getVal(["Remarks", "Note"]);
            const bast1 = getVal(["BAST-1", "BAST 1", "BAST-I", "BAST I"]);

            return (
              <tr key={proj.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors group">
                <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100 sticky left-0 bg-slate-50/90 dark:bg-[#1a1a1e]/90 group-hover:bg-slate-100 dark:group-hover:bg-[#202024] z-10 transition-colors backdrop-blur shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  {unit}
                </td>
                <td className="px-4 py-3 max-w-[280px] whitespace-normal leading-snug text-slate-800 dark:text-slate-200 font-medium">
                  {desc}
                </td>
                <td className="px-4 py-3">{pr}</td>
                <td className="px-4 py-3">{received}</td>
                <td className="px-4 py-3">{budget}</td>
                <td className="px-4 py-3">{startDesign}</td>
                <td className="px-4 py-3">{approval}</td>
                <td className="px-4 py-3">{tender}</td>
                <td className="px-4 py-3">{aps}</td>
                <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold">{contractAmtRaw}</td>
                <td className="px-4 py-3">{commence}</td>
                <td className="px-4 py-3">{endContact}</td>
                <td className="px-4 py-3">{actualComp}</td>
                <td className="px-4 py-3 font-bold">{deviation}</td>
                <td className="px-4 py-3 max-w-[200px] truncate" title={siteProg}>{siteProg}</td>
                <td className="px-4 py-3 max-w-[300px] whitespace-normal leading-snug" title={remarks}>
                   <span className="line-clamp-2">{remarks}</span>
                </td>
                <td className="px-4 py-3 text-cyan-600 dark:text-cyan-400 font-medium">{bast1}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
`;
code = code.substring(0, phaseCardStart) + newPhaseTable;

fs.writeFileSync('src/components/dashboard/CapexGanttMonitor.tsx', code);
console.log('Patched');