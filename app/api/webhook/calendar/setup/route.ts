import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function GET() {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    // 1. CLEANUP: Stop the existing watch if IDs exist in Redis
    const oldResourceId = await redis.get<string>('google_calendar_resource_id');
    const oldChannelId = await redis.get<string>('google_calendar_channel_id');

    if (oldResourceId && oldChannelId) {
      try {
        await calendar.channels.stop({
          requestBody: { id: oldChannelId, resourceId: oldResourceId }
        });
      } catch (e) { console.log("Old channel already dead or expired."); }
    }

    // 2. INITIALIZE: Create fresh channel
    const newChannelId = `ayur-sync-${Date.now()}`;
    const watchRes = await calendar.events.watch({
      calendarId: CALENDAR_ID,
      requestBody: {
        id: newChannelId,
        type: 'web_hook',
        address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/calendar`,
      },
    });

    // 3. SYNC: Fetch initial token to start tracking changes from NOW
    const response = await calendar.events.list({ calendarId: CALENDAR_ID });
    
    await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    await redis.set('google_calendar_resource_id', watchRes.data.resourceId);
    await redis.set('google_calendar_channel_id', newChannelId);

    return Response.json({ success: true, message: "Webhook Pipeline Renewed" });
  } catch (error: any) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}