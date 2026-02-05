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
    const response = await calendar.events.list({ calendarId: CALENDAR_ID, syncToken: syncToken || undefined });

    if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);

    for (const event of (response.data.items || [])) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let data;
      try { data = JSON.parse(event.description); } catch { continue; }

      // Reset Gatekeeper: ignore updates triggered by our own system logic
      if (['USER', 'DOCTOR', 'SYSTEM'].includes(data.lastUpdatedBy)) {
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId: event.id!,
          requestBody: { description: JSON.stringify({ ...data, lastUpdatedBy: 'EXTERNAL' }) }
        });
        continue; 
      }

      const currentStart = event.start?.dateTime;
      if (!currentStart || data.lastNotifiedTime === currentStart) continue;

      // DOCTOR MANUAL MOVE DETECTED
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: currentStart,
        timeMax: event.end?.dateTime!,
        singleEvents: true
      });
      const ghost = overlaps.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
      if (ghost) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id! });

      const timeStr = new Date(currentStart).toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      });
      
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...data, 
            lastNotifiedTime: currentStart, 
            rescheduled: false, 
            lastUpdatedBy: 'DOCTOR' 
          }) 
        }
      });

      // Notifications
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: data.email,
        subject: `Appointment Update - Dr. Dixit`,
        html: `<p>Namaste, your session has been moved by the doctor to: <b>${timeStr}</b>.</p>`
      });

      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste, your appointment is rescheduled by Dr. Dixit to ${timeStr}. Join: ${process.env.NEXT_PUBLIC_MEET_LINK}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${data.mobile.toString().slice(-10)}`
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    if (error.code === 410) await redis.del('google_calendar_sync_token');
    return new Response('OK', { status: 200 });
  }
}