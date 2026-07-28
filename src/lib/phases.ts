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

/**
 * The five phases that own bespoke columns in `project_phases`
 * (received_date, start_design_date, commence_date, …). Anything added via
 * Master Setup beyond these is a "custom" phase and stores its timeline in the
 * generic `phase_start_date` / `phase_end_date` columns instead.
 */
export const BUILTIN_PHASE_CODES: readonly string[] = PHASE_LIST.map(p => p.code);

/** SQL list literal of the built-in codes, for `NOT IN (…)` filters. */
export const BUILTIN_PHASE_CODES_SQL = BUILTIN_PHASE_CODES.map(c => `'${c}'`).join(", ");

export function isCustomPhase(phaseCode: string | null | undefined): boolean {
  return Boolean(phaseCode) && !BUILTIN_PHASE_CODES.includes(phaseCode as string);
}

/** A phase added via Master Setup, carrying only generic timeline fields. */
export type CustomPhase = {
  phaseId: string;
  code: string;
  name: string;
  order: number;
  start: string | null;
  end: string | null;
  progress: number | null;
  notes: string | null;
};

/** Stable color for a custom phase — derived from its code so it doesn't shift. */
const CUSTOM_PHASE_PALETTE = ["#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#6366f1"];
export function customPhaseColor(code: string): string {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return CUSTOM_PHASE_PALETTE[h % CUSTOM_PHASE_PALETTE.length];
}
