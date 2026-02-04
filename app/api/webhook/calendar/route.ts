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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK', { status: 200 });

    const syncToken = await redis.get<string>('google_calendar_sync_token');
    const response = await calendar.events.list({ calendarId: CALENDAR_ID, syncToken: syncToken || undefined });

    if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);

    for (const event of (response.data.items || [])) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try { patientData = JSON.parse(event.description); } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      if (!newStart) continue;

      // HANDSHAKE: If we already notified for this specific time, ignore.
      if (patientData.lastNotifiedTime === newStart && patientData.lastUpdatedBy === 'system_webhook') continue;

      // OVERLAP SWEEP: Clear space around the new time
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: newStart,
        timeMax: event.end?.dateTime!,
        singleEvents: true,
      });
      const ghosts = overlaps.data.items?.filter(e => e.summary === 'Available' && e.id !== event.id);
      if (ghosts) {
        for (const slot of ghosts) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
      }

      const timeStr = new Date(newStart).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
      const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

      // Update description to mark as processed and RESET reschedule rights
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ ...patientData, lastNotifiedTime: newStart, lastUpdatedBy: 'system_webhook', rescheduled: false }) 
        }
      });

      // Notify
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Moved - ${patientData.name}`,
        html: `<div style="font-family: sans-serif; padding:20px; border:1px solid #eee;">
                <p>Namaste ${patientData.name}, your session has been moved to <b>${timeStr}</b>.</p>
                <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting</a></p>
                <p style="font-size:12px; margin-top:15px;">Need to change this? <a href="${reschedUrl}">Reschedule once</a></p>
              </div>`
      });

      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, session moved to ${timeStr}.\n\nReschedule: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${cleanPhone.startsWith('91') ? '+' + cleanPhone : '+91' + cleanPhone}`
      });
    }
    return new Response('OK', { status: 200 });
  } catch (error) { return new Response('Error', { status: 500 }); }
}