import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const OPENCLAW_GATEWAY = 'http://172.16.10.8:18790';
const GATEWAY_TOKEN = 'bc8446171d9be8d203bb16cd196fc140c57987ce1e396f36';

export async function GET() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${OPENCLAW_GATEWAY}/telemetry`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Gateway returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.name === 'AbortError' ? 'Gateway Timeout' : error.message,
      agents: [
        { id: "main", name: "Gercep Main Core", status: "Offline", model: "Claude 3.7 Sonnet", tokens: "0", limit: "1.0m", percent: 0 },
        { id: "idea-tech", name: "IDEA-Tech Helper", status: "Offline", model: "Claude 3.5 Haiku", tokens: "0", limit: "200k", percent: 0 },
        { id: "idea-data", name: "IDEA-Data Helper", status: "Offline", model: "Claude 3.5 Haiku", tokens: "0", limit: "200k", percent: 0 }
      ],
      telemetry: { totalTokens: "0", rateLimitStatus: "Error", uptime: "Offline", gateway: "Connection Failed" },
      logs: []
    });
  }
}
