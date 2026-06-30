export const PHASE_COLORS: Record<string, string> = {
  operational_brief:  "#64748b",
  design:             "#3b82f6",
  project_control:    "#f59e0b",
  project_management: "#14b8a6",
  handover:           "#22c55e",
};

export const PHASE_LIST = [
  { code: "operational_brief",  key: "brief",    label: "Operational Brief",  shortLabel: "Brief",    color: "#64748b" },
  { code: "design",             key: "design",   label: "Design",             shortLabel: "Design",   color: "#3b82f6" },
  { code: "project_control",    key: "control",  label: "Project Control",    shortLabel: "Control",  color: "#f59e0b" },
  { code: "project_management", key: "pm",       label: "Project Management", shortLabel: "PM",       color: "#14b8a6" },
  { code: "handover",           key: "handover", label: "Handover",           shortLabel: "Handover", color: "#22c55e" },
] as const;

export type PhaseCode = typeof PHASE_LIST[number]["code"];
export type PhaseKey  = typeof PHASE_LIST[number]["key"];

export const DEFAULT_PHASE_COLOR = "#94a3b8";
