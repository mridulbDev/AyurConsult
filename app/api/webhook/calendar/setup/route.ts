import { google } from 'googleapis';

export async function GET(req: Request) {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.watch({
      calendarId: process.env.GOOGLE_CALENDAR_ID!,
      requestBody: {
        id: `dr-dixit-sub-${Date.now()}`, 
        type: 'web_hook',
        // 🚩 MUST point to your main calendar route
        address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/calendar`, 
      },
    });

    return Response.json({ 
      success: true, 
      message: "Subscription started! Google is now watching Dr. Dixit's Calendar.", 
      expires: new Date(parseInt(response.data.expiration!)).toLocaleString('en-IN') 
    });
  } catch (error: any) {
    console.error("Watch Setup Error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}