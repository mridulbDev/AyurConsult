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

    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    const syncToken = await redis.get<string>('google_calendar_sync_token');
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken: syncToken || undefined,
    });

    if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);

    for (const event of (response.data.items || [])) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try { patientData = JSON.parse(event.description); } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      if (!newStart) continue;

      // WEBHOOK LOOP PREVENTION
      if (patientData.lastNotifiedTime === newStart && patientData.lastUpdatedBy === 'system_webhook') continue;

      // DOCTOR MANUAL MOVE LOGIC:
      // 1. Delete overlapping "Available" slots in the new position
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: new Date(new Date(newStart).getTime() - 1000).toISOString(),
        timeMax: new Date(new Date(event.end?.dateTime!).getTime() + 1000).toISOString(),
        singleEvents: true,
      });

      const ghostSlots = overlaps.data.items?.filter(e => e.summary === 'Available' && e.id !== event.id);
      if (ghostSlots) {
        for (const slot of ghostSlots) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
      }

      // 2. Reset patient reschedule rights and mark notified
      const updatedData = { 
        ...patientData, 
        lastNotifiedTime: newStart, 
        lastUpdatedBy: 'system_webhook', 
        rescheduled: false // Reset flag because DOCTOR made the move
      };

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify(updatedData) }
      });

      // 3. Send Notifications ONLY ONCE
      const timeStr = new Date(newStart).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
      const rescheduleUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

      try {
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Appointment Moved - Dr. Dixit Ayurveda`,
          html: `<div style="font-family: sans-serif; padding: 20px;">
                  <h2>Namaste ${patientData.name},</h2>
                  <p>Your session has been moved to: <b>${timeStr}</b></p>
                  <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting</a></p>
                  <p>Need to change this? <a href="${rescheduleUrl}">Reschedule here</a></p>
                </div>`
        });

        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPatientPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your session is moved to ${timeStr}.\nMeeting: ${process.env.NEXT_PUBLIC_MEET_LINK}\nReschedule: ${rescheduleUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${formattedPatientPhone}`
        });
      } catch (e) { console.error("Notification failed", e); }
    }
    return new Response('OK', { status: 200 });
  } catch (error) { return new Response('Error', { status: 500 }); }
}