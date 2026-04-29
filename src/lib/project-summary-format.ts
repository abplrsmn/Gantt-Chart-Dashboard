import { SummaryBuckets, ProjectManagementSummaryRow } from './project-summary';

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function projectLabel(row: ProjectManagementSummaryRow): string {
  const unitCodeLabel = row.unit_code ? `[${row.unit_code}] ` : '';
  return `${unitCodeLabel}${row.project_name}`;
}

function formatDaysRemaining(value?: number | null): string | null {
  if (value === null || value === undefined) return null;
  return `${Math.abs(value)} days left`;
}

export function formatDailySummary(summary: SummaryBuckets): string {
  const { counts, handover, inProgress, nearDeadline } = summary;

  const todayFormatted = new Date(summary.generatedAt).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let message = `📊 Daily Project Management Summary\n`;
  message += `Date: ${todayFormatted}\n\n`;

  message += `📈 Overview\n\n`;
  message += `• 🟢 In Progress: ${counts.inProgress} projects\n`;
  message += `• 🟡 Near Deadline: ${counts.nearDeadline} projects\n`;
  message += `• 📦 Handover: ${counts.handover} projects\n\n`;

  if (counts.nearDeadline > 0) {
    message += `⚠️ NEAR DEADLINE (${counts.nearDeadline})\n`;
    for (const row of nearDeadline) {
      message += `${projectLabel(row)}\n`;
      message += `• Start Date: ${formatDate(row.commence_date)}\n`;
      message += `• End Date: ${formatDate(row.end_contract_date)}\n`;
      const daysText = formatDaysRemaining(row.days_remaining);
      if (row.commence_date && daysText) {
        message += `• Days Remaining: ${daysText}\n`;
      }
      if (row.current_site_progress) {
        message += `• Progress: ${row.current_site_progress}\n`;
      }
      message += `\n`;
    }
  }

  if (counts.inProgress > 0) {
    message += `🟢 IN PROGRESS (${counts.inProgress})\n`;
    for (const row of inProgress) {
      message += `${projectLabel(row)}\n`;
      message += `• Start Date: ${formatDate(row.commence_date)}\n`;
      message += `• End Date: ${formatDate(row.end_contract_date)}\n`;
      const daysText = formatDaysRemaining(row.days_remaining);
      if (row.commence_date && daysText) {
        message += `• Days Remaining: ${daysText}\n`;
      }
      if (row.current_site_progress) {
        message += `• Progress: ${row.current_site_progress}\n`;
      }
      message += `\n`;
    }
  }

  if (counts.handover > 0) {
    message += `📦 HANDOVER (${counts.handover})\n`;
    for (const row of handover) {
      message += `${projectLabel(row)}\n`;
      message += `• Start Date: ${formatDate(row.commence_date)}\n`;
      message += `• End Date: ${formatDate(row.end_contract_date)}\n`;
      message += `• Actual Completion: ${formatDate(row.actual_phase_completion_date)}\n`;
      message += `• BAST-1: ${formatDate(row.bast_1_date)}\n`;
      message += `\n`;
    }
  }

  return message.trimEnd();
}
