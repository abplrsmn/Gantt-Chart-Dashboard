const OPENCLAW_WEBHOOK_URL = (process.env.OPENCLAW_WEBHOOK_URL || '').trim();
const OPENCLAW_API_KEY = (process.env.OPENCLAW_API_KEY || '').trim();

type OpenClawPayload = {
  groupId?: string;
  message: string;
};

export async function sendOpenClawMessage(payload: OpenClawPayload) {
  if (!OPENCLAW_WEBHOOK_URL) {
    throw new Error('OPENCLAW_WEBHOOK_URL is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (OPENCLAW_API_KEY) {
    headers['x-api-key'] = OPENCLAW_API_KEY;
  }

  const response = await fetch(OPENCLAW_WEBHOOK_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await response.text();
  let data: unknown = text;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(`OpenClaw send failed (${response.status})`);
  }

  return data;
}
