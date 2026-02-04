import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET(req: Request) {
  try {
    // 1. Auth Setup
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    // 2. Generate a unique channel ID
    const channelId = `ayur-sync-${Date.now()}`;

    // 3. Register the Webhook with Google
    const watchRes = await calendar.events.watch({
      calendarId: CALENDAR_ID,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/calendar`,
      },
    });

    // 4. Update the Sync Token and Resource ID in Redis
    // Resource ID is needed if you ever want to manually stop the watch
    const response = await calendar.events.list({ calendarId: CALENDAR_ID });
    const initialToken = response.data.nextSyncToken;

    if (initialToken) {
      await redis.set('google_calendar_sync_token', initialToken);
      await redis.set('google_calendar_resource_id', watchRes.data.resourceId);
    }

    return Response.json({ 
      success: true, 
      message: "Sync Channel Renewed", 
      expires: watchRes.data.expiration 
    });
  } catch (error: any) {
    console.error("Cron Setup Error:", error.message);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}