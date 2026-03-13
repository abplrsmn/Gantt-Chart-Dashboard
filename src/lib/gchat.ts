const WEBHOOK_URL = process.env.GCHAT_WEBHOOK_URL;

export async function sendNotification(text: string) {
  if (!WEBHOOK_URL) {
    console.warn('GCHAT_WEBHOOK_URL is not configured.');
    return;
  }

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send GChat message: ${response.statusText}`);
  }

  return response.json();
}
