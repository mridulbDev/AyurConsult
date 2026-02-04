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
      // Only care about events that are CONFIRMED and moved by the doctor
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try { patientData = JSON.parse(event.description); } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      const newEnd = event.end?.dateTime;
      if (!newStart || !newEnd) continue;

      // 🚩 LOOP PREVENTION: Skip if we already handled this specific move
      if (patientData.lastNotifiedTime === newStart && patientData.lastUpdatedBy === 'system_webhook') continue;

      /** * 🚩 ROBUST OVERLAP SWEEP 
       * We search for any "Available" slot at the EXACT same start time.
       * We use singleEvents: true to ensure we catch recurring instances too.
       */
      const checkOverlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: newStart,
        timeMax: newEnd,
        singleEvents: true,
      });

      const duplicateSlots = checkOverlaps.data.items?.filter(e => 
        (e.summary === 'Available' || e.summary?.includes('PENDING')) && e.id !== event.id
      );

      if (duplicateSlots && duplicateSlots.length > 0) {
        for (const slot of duplicateSlots) {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
        }
      }

      const timeStr = new Date(newStart).toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      });
      const reschedUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;

      // Update event metadata to prevent loops and reset patient's reschedule right
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...patientData, 
            lastNotifiedTime: newStart, 
            lastUpdatedBy: 'system_webhook', 
            rescheduled: false 
          }) 
        }
      });

      // Send Email
      const transporter = nodemailer.createTransport({ 
        service: 'gmail', 
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Updated - ${patientData.name}`,
        html: `<div style="font-family: sans-serif; padding:20px; border:1px solid #eee;">
                <h3>Appointment Rescheduled</h3>
                <p>Namaste ${patientData.name}, your session with Dr.Dixit is moved to: <b>${timeStr}</b></p>
                <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}" style="color:#123025; font-weight:bold;">Join Video Call</a></p>
                <hr style="border:none; border-top:1px solid #eee; margin:20px 0;">
                <p style="font-size:12px; color:#666;">Need to change this? You can <a href="${reschedUrl}">reschedule here</a>.</p>
              </div>`
      });

      // Send WhatsApp
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your session with Dr.Dixit is moved to ${timeStr}.\n\nMeeting: ${process.env.NEXT_PUBLIC_MEET_LINK}\n\nReschedule: ${reschedUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${cleanPhone.startsWith('91') ? '+' + cleanPhone : '+91' + cleanPhone}`
        });
      } catch (smsErr) { console.error("SMS failed", smsErr); }
    }
    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response('Error', { status: 500 });
  }
}