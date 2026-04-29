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
    projectManagementDate?: string;
    handoverDate?: string;
  };
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

function mapRow(row: ProjectManagementSummaryRow, phase: GanttCapexPhase): GanttCapexProject {
  const unit = String(row.unit_code || row.unit_name || 'UNKNOWN').trim().toUpperCase();
  const currentSiteProgress = row.current_site_progress || undefined;
  const handoverDate = toIsoDate(row.bast_1_date || row.bast_2_date || null);
  const startDate = toIsoDate(row.commence_date);
  const endDate = toIsoDate(row.end_contract_date || row.bast_1_date || row.bast_2_date || null);
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
      projectManagementDate: startDate,
      handoverDate,
    },
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
