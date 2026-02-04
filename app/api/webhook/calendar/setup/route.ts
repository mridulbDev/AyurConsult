import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });

export async function GET(req: Request) {
  // Simple security check: Only you can trigger this
  const { searchParams } = new URL(req.url);
  if (searchParams.get('secret') !== process.env.ADMIN_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const channelId = `channel-ayur-${Date.now()}`;
    
    const watchRes = await calendar.events.watch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/calendar`,
        // Webhooks expire. Set a token to track it.
        token: 'doctor-dixit-sync', 
      },
    });

    // Store the initial Sync Token so the webhook knows where to start
    const listRes = await calendar.events.list({ calendarId: process.env.GOOGLE_CALENDAR_ID });
    if (listRes.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', listRes.data.nextSyncToken);
    }

    return Response.json({ 
      success: true, 
      message: "Webhook registered", 
      details: watchRes.data 
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}