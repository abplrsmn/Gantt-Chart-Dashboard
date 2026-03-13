import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    // TODO: Handle interactive button clicks from Google Chat
    console.log('Received GChat interaction:', payload);

    // Return format required by Google Chat for interactive responses
    return NextResponse.json({
      actionResponse: {
        type: 'UPDATE_MESSAGE'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
