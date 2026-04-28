import { SummaryBuckets, ProjectPhaseSummary } from './project-summary';

/**
 * Helper to group project phases by project name.
 */
function groupByProject(phases: ProjectPhaseSummary[]) {
  return phases.reduce((acc, phase) => {
    if (!acc[phase.project_name]) {
      acc[phase.project_name] = [];
    }
    acc[phase.project_name].push(phase);
    return acc;
  }, {} as Record<string, ProjectPhaseSummary[]>);
}

/**
 * Transforms raw JSON bucket data into a clean text/markdown representation for group chat.
 * Grouping occurs per-project to keep the chat payload tidy.
 */
export function formatDailySummary(summary: SummaryBuckets): string {
  const { counts, nearDeadline, overdue } = summary;
  
  const todayFormatted = new Date(summary.generatedAt).toLocaleDateString('id-ID', {
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  let message = `📊 *Daily CAPEX Project Summary*\n`;
  message += `Date: ${todayFormatted}\n\n`;
  
  message += `📈 *Overview*\n`;
  message += `- 🟢 On Progress: ${counts.onProgress} phases\n`;
  message += `- 🟡 Near Deadline: ${counts.nearDeadline} phases\n`;
  message += `- 🔴 Overdue: ${counts.overdue} phases\n\n`;

  // Section 1: OVERDUE
  if (counts.overdue > 0) {
    message += `🚨 *OVERDUE (${counts.overdue})*\n`;
    const overdueByProject = groupByProject(overdue);
    for (const [projName, phases] of Object.entries(overdueByProject)) {
      const unitCodeLabel = phases[0].unit_code ? `[${phases[0].unit_code}]` : '';
      message += `*${projName}* ${unitCodeLabel}\n`;
      phases.forEach(p => {
        message += `  - ${p.phase_name}: Overdue by ${p.days_overdue} days\n`;
      });
    }
    message += `\n`;
  }

  // Section 2: NEAR DEADLINE
  if (counts.nearDeadline > 0) {
    message += `⚠️ *NEAR DEADLINE (${counts.nearDeadline})*\n`;
    const nearByProject = groupByProject(nearDeadline);
    for (const [projName, phases] of Object.entries(nearByProject)) {
      const unitCodeLabel = phases[0].unit_code ? `[${phases[0].unit_code}]` : '';
      message += `*${projName}* ${unitCodeLabel}\n`;
      phases.forEach(p => {
        const dueText = p.days_to_deadline === 0 ? "Today" : `in ${p.days_to_deadline} days`;
        message += `  - ${p.phase_name}: Due ${dueText}\n`;
      });
    }
    message += `\n`;
  }

  message += `_🤖 This is an automated summary._`;
  return message;
}
