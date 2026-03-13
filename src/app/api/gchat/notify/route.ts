import { NextResponse } from 'next/server';
import { sendNotification } from '@/lib/gchat';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message } = body;
    
    if (!message) {
      return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
    }

    await sendNotification(message);
    return NextResponse.json({ success: true, message: 'Notification sent to Google Chat' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
