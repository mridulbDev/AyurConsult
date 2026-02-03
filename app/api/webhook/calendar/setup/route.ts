import { google } from 'googleapis';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    // 1. Initial connection check
    console.log("Setup route triggered");

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    
    const calendar = google.calendar({ version: 'v3', auth });

    // 2. Create the watch request
    const response = await calendar.events.watch({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      requestBody: {
        id: `dr-dixit-sub-${Date.now()}`, 
        type: 'web_hook',
        address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/calendar`, 
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: "Google Watch Active", 
      expires: response.data.expiration 
        ? new Date(parseInt(response.data.expiration)).toLocaleString('en-IN') 
        : "Unknown"
    });

  } catch (error: any) {
    console.error("Setup Error Details:", error);
    return NextResponse.json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}