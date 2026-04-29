import { getDailyProjectSummary } from './project-summary';
import { formatDailySummary } from './project-summary-format';

export type SummarySendMode = 'daily-summary' | 'overdue-reminder' | 'near-deadline-reminder';

function parseChatIds(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getTargetChatIds(mode: SummarySendMode): string[] {
  if (mode === 'daily-summary') {
    return parseChatIds(process.env.TELEGRAM_SUMMARY_CHAT_IDS);
  }
  return parseChatIds(process.env.TELEGRAM_REMINDER_CHAT_IDS);
}

function pickMessageForMode(mode: SummarySendMode, fullMessage: string): string {
  // For now, reuse the same formatted summary.
  // Next phase can add mode-specific formatting (overdue-only / near-deadline-only).
  return fullMessage;
}

/**
 * High-level orchestration for compiling and sending the project summary.
 * Still stub-safe for now: resolves targets and logs the payload instead of sending to Telegram.
 */
export async function sendProjectSummaryToGroupChat(mode: SummarySendMode = 'daily-summary'): Promise<boolean> {
  try {
    const summaryBucket = await getDailyProjectSummary();
    const formattedMessage = formatDailySummary(summaryBucket);
    const finalMessage = pickMessageForMode(mode, formattedMessage);
    const targetChatIds = getTargetChatIds(mode);

    console.log(`[SENDER-STUB] Mode: ${mode}`);
    console.log(`[SENDER-STUB] Target chat IDs: ${targetChatIds.length > 0 ? targetChatIds.join(', ') : '(none configured)'}`);
    console.log('='.repeat(40));
    console.log(finalMessage);
    console.log('='.repeat(40));

    return true;
  } catch (error) {
    console.error('Failed to execute sendProjectSummaryToGroupChat:', error);
    return false;
  }
}
