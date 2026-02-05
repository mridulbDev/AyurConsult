import { google } from 'googleapis';
import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();

export async function POST(req: Request) {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK');

    const syncToken = await redis.get<string>('google_calendar_sync_token');
    const response = await calendar.events.list({ 
      calendarId: CALENDAR_ID, 
      syncToken: syncToken ?? undefined 
    });

    if (response.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const changes = response.data.items || [];
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
    });

    for (const event of changes) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try { patientData = JSON.parse(event.description); } catch { continue; }

      const currentStart = event.start?.dateTime;
      if (!currentStart) continue;

      // IDEMPOTENCY SHIELD: If time matches metadata, the system did this move. IGNORE.
      if (patientData.lastNotifiedTime === currentStart) continue;

      // DOCTOR MOVE DETECTED: Time changed but metadata still has the old time.
      
      // Cleanup destination slot
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: currentStart,
        timeMax: event.end?.dateTime!,
        singleEvents: true
      });
      const ghost = overlaps.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
      if (ghost?.id) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id });

      const timeStr = new Date(currentStart).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
      const reschedUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;

      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Update - Dr. Dixit Ayurveda`,
        html: `<p>Namaste ${patientData.name}, the doctor moved your session to: <b>${timeStr}</b></p>
               <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting</a> | <a href="${reschedUrl}">Reschedule Link</a></p>`
      });

      // Update metadata to sync the "notified time" with the "current time"
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: {
          description: JSON.stringify({ ...patientData, lastNotifiedTime: currentStart, rescheduled: false, lastUpdatedBy: 'doctor' })
        }
      });
    }
    return new Response('OK');
  } catch (error: any) {
    if (error.code === 410) await redis.del('google_calendar_sync_token');
    return new Response('OK');
  }
}