import { getDailyProjectSummary, type ProjectManagementSummaryRow } from './project-summary';

export type GanttCapexPhase = 'brief' | 'design' | 'control' | 'project_management' | 'handover' | 'done' | 'blocked';

export type GanttCapexProject = {
  id: string;
  unit: string;
  hotelCode: string;
  name: string;
  start?: string;
  end?: string;
  status: string;
  progress?: number;
  note?: string;
  pic?: string;
  nextAction?: string;
  url?: string;
  phase: GanttCapexPhase;
  isExecution: boolean;
  deadlineRisk: 'none' | 'normal' | 'near' | 'overdue';
  blocked: boolean;
  milestones: {
    briefDate?: string;
    designDate?: string;
    controlDate?: string;
    projectManagementDate?: string;
    handoverDate?: string;
  };
  phaseWindows?: Array<{
    phase: GanttCapexPhase;
    start?: string;
    end?: string;
  }>;
  source: 'db-summary';
};

function toIsoDate(value?: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function deriveDeadlineRisk(daysRemaining?: number | null): GanttCapexProject['deadlineRisk'] {
  if (daysRemaining === null || daysRemaining === undefined) return 'none';
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 14) return 'near';
  return 'normal';
}

function extractProgressPercent(note?: string | null): number | undefined {
  if (!note) return undefined;
  const match = String(note).match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, Math.min(100, parsed));
}

function deriveProgressFallback(row: ProjectManagementSummaryRow, phase: GanttCapexPhase): number | undefined {
  if (phase === 'handover') return 100;

  const note = String(row.current_site_progress || '').trim().toLowerCase();
  if (!note) return undefined;

  if (note.includes('defect')) return 95;
  if (note.includes('final') || note.includes('finishing')) return 90;
  if (note.includes('almost')) return 85;
  if (note.includes('resume')) return 60;
  if (note.includes('start')) return 10;
  if (note.includes('mobilization') || note.includes('mobilisation')) return 5;
  if (note.includes('waiting') || note.includes('awaiting')) return 5;

  const actualCompletion = row.actual_phase_completion_date ? new Date(row.actual_phase_completion_date) : null;
  const commence = row.commence_date ? new Date(row.commence_date) : null;
  const end = row.end_contract_date ? new Date(row.end_contract_date) : null;

  if (
    commence && end &&
    !Number.isNaN(commence.getTime()) &&
    !Number.isNaN(end.getTime())
  ) {
    const now = new Date();
    const total = end.getTime() - commence.getTime();
    const elapsed = now.getTime() - commence.getTime();
    if (total > 0) {
      const ratio = Math.max(0, Math.min(0.95, elapsed / total));
      return Math.max(3, Math.round(ratio * 100));
    }
  }

  if (actualCompletion && !Number.isNaN(actualCompletion.getTime())) return 100;
  return undefined;
}


function phaseNameToKey(phaseName?: string | null): GanttCapexPhase | null {
  const normalized = String(phaseName || '').trim().toLowerCase();
  if (normalized === 'operational brief') return 'brief';
  if (normalized === 'design') return 'design';
  if (normalized === 'project control') return 'control';
  if (normalized === 'project management') return 'project_management';
  if (normalized === 'handover') return 'handover';
  return null;
}

function isOrderedIsoRange(start?: string, end?: string) {
  if (!start || !end) return false;
  const startMs = new Date(`${start}T00:00:00+07:00`).getTime();
  const endMs = new Date(`${end}T00:00:00+07:00`).getTime();
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;
}

function buildPhaseWindows(row: ProjectManagementSummaryRow): GanttCapexProject['phaseWindows'] {
  if (!Array.isArray(row.phase_windows)) return [];

  return row.phase_windows
    .flatMap((phase) => {
      const phaseKey = phaseNameToKey(phase.phase_name);
      if (!phaseKey) return [];
      const entry = {
        phase: phaseKey,
        start: toIsoDate(phase.start_date),
        end: toIsoDate(phase.end_date),
      };
      return isOrderedIsoRange(entry.start, entry.end) ? [entry] : [];
    });
}


function deriveWindowFromPhaseDates(row: ProjectManagementSummaryRow) {
  const dates = (row.phase_windows || [])
    .flatMap((phase) => [phase.start_date, phase.end_date])
    .map((value) => toIsoDate(value))
    .filter((value): value is string => !!value)
    .map((value) => new Date(`${value}T00:00:00+07:00`))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (dates.length === 0) return { start: undefined, end: undefined };
  return {
    start: dates[0].toISOString().slice(0, 10),
    end: dates[dates.length - 1].toISOString().slice(0, 10),
  };
}


function mapRow(row: ProjectManagementSummaryRow, phase: GanttCapexPhase): GanttCapexProject {
  const unit = String(row.unit_code || row.unit_name || 'UNKNOWN').trim().toUpperCase();
  const currentSiteProgress = row.current_site_progress || undefined;
  const handoverDate = toIsoDate(row.bast_1_date || row.bast_2_date || null);
  const phaseDerivedWindow = deriveWindowFromPhaseDates(row);
  const explicitProjectStart = toIsoDate(row.project_start_date);
  const explicitProjectEnd = toIsoDate(row.project_end_date);
  const hasValidExplicitRange = isOrderedIsoRange(explicitProjectStart, explicitProjectEnd);
  const startDate = hasValidExplicitRange ? explicitProjectStart : (phaseDerivedWindow.start || toIsoDate(row.commence_date));
  const endDate = hasValidExplicitRange ? explicitProjectEnd : (phaseDerivedWindow.end || toIsoDate(row.end_contract_date || row.bast_1_date || row.bast_2_date || null));
  const progress = extractProgressPercent(currentSiteProgress) ?? deriveProgressFallback(row, phase);

  return {
    id: `db-summary:${row.project_id}:${phase}`,
    unit,
    hotelCode: unit,
    name: row.project_name,
    start: startDate,
    end: endDate,
    status: phase === 'handover' ? 'HANDOVER' : 'PROJECT_MANAGEMENT',
    progress,
    note: currentSiteProgress,
    pic: undefined,
    nextAction: undefined,
    url: undefined,
    phase,
    isExecution: true,
    deadlineRisk: phase === 'handover' ? 'none' : deriveDeadlineRisk(row.days_remaining),
    blocked: false,
    milestones: {
      briefDate: toIsoDate(row.phase_windows?.find((item) => item.phase_name === 'Operational Brief')?.start_date || null),
      designDate: toIsoDate(row.phase_windows?.find((item) => item.phase_name === 'Design')?.start_date || null),
      controlDate: toIsoDate(row.phase_windows?.find((item) => item.phase_name === 'Project Control')?.start_date || null),
      projectManagementDate: toIsoDate(row.commence_date) || startDate,
      handoverDate,
    },
    phaseWindows: buildPhaseWindows(row),
    source: 'db-summary',
  };
}

export async function getProjectGanttProjects(): Promise<GanttCapexProject[]> {
  const summary = await getDailyProjectSummary();
  return [
    ...summary.inProgress.map((row) => mapRow(row, 'project_management')),
    ...summary.handover.map((row) => mapRow(row, 'handover')),
  ];
}
