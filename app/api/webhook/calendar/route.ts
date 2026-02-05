import { google } from 'googleapis';
import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

export async function POST(req: Request) {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK');

    // 1. Get Sync Token
    const syncToken = await redis.get<string>('google_calendar_sync_token');
    let response;
    try {
      response = await calendar.events.list({ calendarId: CALENDAR_ID, syncToken: syncToken || undefined });
    } catch (e: any) {
      if (e.code === 410) {
        await redis.del('google_calendar_sync_token');
        return new Response('Sync Reset');
      }
      throw e;
    }

    if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let data;
      try { data = JSON.parse(event.description); } catch { continue; }

      // 🛑 THE MUTE LOGIC: If the last update was by our system, DO NOT process it.
      // This stops the infinite loop.
      if (data.lastUpdatedBy === 'SYSTEM') {
        // We do one final patch to change status to EXTERNAL so we can track future Doctor moves
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId: event.id!,
          requestBody: { description: JSON.stringify({ ...data, lastUpdatedBy: 'EXTERNAL' }) }
        });
        continue; 
      }

      const currentStart = event.start?.dateTime;
      if (!currentStart || data.lastNotifiedTime === currentStart) continue;

      // DOCTOR MOVED THE EVENT MANUALLY
      // [Cleanup logic for ghost slots...]
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID, timeMin: currentStart, timeMax: event.end?.dateTime!, singleEvents: true
      });
      const ghost = overlaps.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
      if (ghost) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id! });

      // Update and Notify
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify({ ...data, lastNotifiedTime: currentStart, lastUpdatedBy: 'SYSTEM' }) }
      });

      await sendDoctorMoveEmail(data, currentStart, event.id!);
    }

    return new Response('OK');
  } catch (error) {
    return new Response('OK');
  }
}

async function sendDoctorMoveEmail(data: any, time: string, id: string) {
  const timeStr = new Date(time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  const transporter = nodemailer.createTransport({ 
    service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
  });
  await transporter.sendMail({
    from: `"Dr. Dixit" <${process.env.DOCTOR_EMAIL}>`,
    to: data.email,
    subject: `Schedule Update`,
    html: `<p>Namaste, your session is now at <b>${timeStr}</b>.<br>Link: ${process.env.NEXT_PUBLIC_MEET_LINK}</p>`
  });
}