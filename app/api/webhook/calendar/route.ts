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

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let data;
      try { data = JSON.parse(event.description); } catch { continue; }

      // 🛑 THE RESET GATEKEEPER
      // If the update was triggered by our own routes (USER, SYSTEM, or DOCTOR update logic)
      if (['USER', 'DOCTOR', 'SYSTEM_CONFIRM'].includes(data.lastUpdatedBy)) {
        console.log(`Resetting flag for ${data.name} to allow future manual moves.`);
        
        // We patch the event to remove the flag. This update will trigger the webhook AGAIN,
        // but next time it will fall through to the manual move logic if the time is different.
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId: event.id!,
          requestBody: { 
            description: JSON.stringify({ ...data, lastUpdatedBy: 'EXTERNAL' }) 
          }
        });
        continue; 
      }

      const currentStart = event.start?.dateTime;
      if (!currentStart) continue;

      // 🛑 TIME CHECK: If the time hasn't changed, ignore it (even if it's an external update)
      if (data.lastNotifiedTime === currentStart) continue;

      // ✅ IF WE ARE HERE: The Doctor manually dragged the event to a new time in the UI.
      
      // 1. Slot Replacement Logic
      const listDest = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: currentStart,
        timeMax: event.end?.dateTime!,
        singleEvents: true
      });
      const ghost = listDest.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
      if (ghost) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id! });

      const timeStr = new Date(currentStart).toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      });
      
      // 2. Update Event: Set flag to DOCTOR to prevent immediate loop, but update the notified time
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...data, 
            lastNotifiedTime: currentStart, 
            rescheduled: false, // Reset so patient can move it again from new spot
            lastUpdatedBy: 'DOCTOR' 
          }) 
        }
      });

      // 3. Notifications
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: data.email,
        subject: `Appointment Update - Dr. Dixit`,
        html: `<p>Namaste, your session is moved to: <b>${timeStr}</b>. <br>Join Link: ${process.env.NEXT_PUBLIC_MEET_LINK}</p>`
      });

      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste, your session is moved to ${timeStr}.\n\nMeeting: ${process.env.NEXT_PUBLIC_MEET_LINK}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${data.phone.toString().slice(-10)}`
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    if (error.code === 410) await redis.del('google_calendar_sync_token');
    return new Response('OK', { status: 200 });
  }
}