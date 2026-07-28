import { NextResponse } from "next/server";
import { runAlertNotification } from "@/lib/alert-notify";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Accepts ?secret=... or Authorization: Bearer ... for manual triggers / external callers.
export async function POST(req: Request) {
  const secret = process.env.ALERT_NOTIFY_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "Notification trigger is not configured" }, { status: 503 });
  if (secret) {
    const url    = new URL(req.url);
    const param  = url.searchParams.get("secret");
    const header = req.headers.get("authorization")?.replace("Bearer ", "");
    const provided = header || param || "";
    const valid = provided.length === secret.length && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret));
    if (!valid) {
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
