import { getDailyProjectSummary } from './project-summary';
import { formatDailySummary } from './project-summary-format';

/**
 * High-level orchestration for compiling and sending the daily summary.
 * Designed to be safely invoked via a standalone cron endpoint later.
 */
export async function sendDailySummaryToGroupChat(): Promise<boolean> {
  try {
    // 1. Execute DB query to retrieve bucket counts and records
    const summaryBucket = await getDailyProjectSummary();

    // 2. Format the nested JSON payload into a group-chat friendly string
    const formattedMessage = formatDailySummary(summaryBucket);

    // 3. Stub sending logic 
    // In the next phase, call fetch() to Google Chat / Telegram here!
    console.log('[SENDER-STUB] Would dispatch message to group chat:');
    console.log('='.repeat(40));
    console.log(formattedMessage);
    console.log('='.repeat(40));

    return true;

  } catch (error) {
    console.error('Failed to execute sendDailySummaryToGroupChat:', error);
    return false;
  }
}
