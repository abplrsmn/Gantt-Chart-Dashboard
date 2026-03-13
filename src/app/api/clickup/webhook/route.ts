import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    // TODO: Verify webhook signature from ClickUp
    // TODO: Process the event (e.g., taskStatusUpdated)
    console.log('Received ClickUp Webhook:', payload);

    return NextResponse.json({ success: true, message: 'Webhook received' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
