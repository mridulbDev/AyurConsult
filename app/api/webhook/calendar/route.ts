import { google } from 'googleapis';
import { Redis } from '@upstash/redis';
import twilio from 'twilio';
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
    
    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK', { status: 200 });

    const syncToken = await redis.get<string>('google_calendar_sync_token');
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken: syncToken || undefined,
    });

    if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let data;
      try { data = JSON.parse(event.description); } catch { continue; }

      const currentStart = event.start?.dateTime;
      if (!currentStart) continue;

      // 🛑 LOOP PREVENTION
      // If the system just updated this event, or the time hasn't actually changed, ABORT.
      if (data.lastNotifiedTime === currentStart) continue;

      // 🛑 ACTION: DOCTOR MOVED THE EVENT
      // 1. Clean up "Available" slot at the new destination to prevent overlaps
      const listDest = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: currentStart,
        timeMax: event.end?.dateTime!,
        singleEvents: true
      });
      const ghost = listDest.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
      if (ghost) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id! });

      // 2. Prepare Notification Data
      const timeStr = new Date(currentStart).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
      const rescheduleUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;
      const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

      // 3. Update Calendar FIRST to lock the state and prevent webhook recursion
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...data, 
            lastNotifiedTime: currentStart, 
            rescheduled: false, // Reset so patient can reschedule once more from new time
            lastUpdatedBy: 'DOCTOR' 
          }) 
        }
      });

      // 4. Send Notifications
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: data.email,
        subject: `Appointment Update - Dr. Dixit`,
        html: `<p>Namaste, your session is moved to: <b>${timeStr}</b>. <br>Join Link: ${meetLink} <br>Need to change? <a href="${rescheduleUrl}">Reschedule here</a></p>`
      });

      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste, your session is moved to ${timeStr}.\nLink: ${meetLink}\nReschedule: ${rescheduleUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${data.phone.toString().slice(-10)}`
      });
    }
    return new Response('OK', { status: 200 });
  } catch (error: any) {
    if (error.code === 410) await redis.del('google_calendar_sync_token');
    return new Response('Error', { status: 200 });
  }
}