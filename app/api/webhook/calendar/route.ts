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
    
    // Skip initial sync verification
    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK', { status: 200 });

    const syncToken = await redis.get<string>('google_calendar_sync_token');
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken: syncToken || undefined,
    });

    // Save token for next incremental sync
    if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      // Only process confirmed events that haven't been deleted
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let data;
      try { data = JSON.parse(event.description); } catch { continue; }

      const currentStart = event.start?.dateTime;
      if (!currentStart) continue;

      // 🛑 LOOP PREVENTION: If time hasn't changed from our last record, ignore this webhook
      if (data.lastNotifiedTime === currentStart) continue;

      // 🛑 STEP 4: DOCTOR MOVED THE EVENT
      // Clean up "Available" slot at the new destination
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
      const rescheduleUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;
      const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

      // Update description to lock the state and prevent webhook recursion
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...data, 
            lastNotifiedTime: currentStart, 
            rescheduled: false, // Reset flag so patient can reschedule once more after Dr move
            lastUpdatedBy: 'DOCTOR' 
          }) 
        }
      });

      // Notify Patient via Email
      const transporter = nodemailer.createTransport({ 
        service: 'gmail', 
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: data.email,
        subject: `Schedule Update - Dr. Dixit Ayurveda`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #123025; border-radius: 10px;">
                <h2>Appointment Moved</h2>
                <p>Namaste ${data.name}, your session has been updated to: <b>${timeStr}</b></p>
                <p><a href="${meetLink}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
                <p style="margin-top:20px; font-size:12px;">Need to change this? <a href="${rescheduleUrl}">Reschedule once more</a></p>
              </div>`
      });

      // Notify Patient via WhatsApp
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${data.name}, your session is moved to ${timeStr}.\n\nMeeting: ${meetLink}\nReschedule: ${rescheduleUrl}`,
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