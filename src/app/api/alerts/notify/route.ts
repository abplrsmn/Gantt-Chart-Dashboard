import { NextResponse } from "next/server";
import { runAlertNotification } from "@/lib/alert-notify";

export const dynamic = "force-dynamic";

// Accepts ?secret=... or Authorization: Bearer ... for manual triggers / external callers.
export async function POST(req: Request) {
  const secret = process.env.ALERT_NOTIFY_SECRET;
  if (secret) {
    const url    = new URL(req.url);
    const param  = url.searchParams.get("secret");
    const header = req.headers.get("authorization")?.replace("Bearer ", "");
    if (param !== secret && header !== secret) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runAlertNotification();
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// Allow GET for easy browser testing
export async function GET(req: Request) {
  return POST(req);
}
