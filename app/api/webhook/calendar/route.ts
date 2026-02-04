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

    if (response.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      // 1. Only act on CONFIRMED events that have patient data in description
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      const newEnd = event.end?.dateTime;
      if (!newStart || !newEnd) continue;

      // 2. STOP INFINITE LOOP
      // If the event was already updated by this webhook, skip it so we don't re-notify
      if (patientData.lastNotifiedTime === newStart && patientData.lastUpdatedBy === 'system_webhook') {
        continue;
      }

      // 3. PROACTIVE SLOT REPLACEMENT
      // Search the exact window where the doctor moved the event
      try {
        const checkSlots = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: new Date(new Date(newStart).getTime() - 1000).toISOString(),
          timeMax: new Date(new Date(newEnd).getTime() + 1000).toISOString(),
          singleEvents: true,
        });

        // Find and delete any "Available" slots in this new position
        const ghostSlots = checkSlots.data.items?.filter(e => 
          e.summary === 'Available' && e.id !== event.id
        );

        if (ghostSlots && ghostSlots.length > 0) {
          for (const slot of ghostSlots) {
            await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
            console.log(`Successfully replaced Available slot at ${newStart}`);
          }
        }
      } catch (err) {
        console.error("Slot replacement failed:", err);
      }

      // 4. PREPARE NOTIFICATIONS
      const timeStr = new Date(newStart).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
      const rescheduleUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

      // 5. UPDATE DESCRIPTION (To mark this move as notified and prevent loops)
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

      // 6. SEND NOTIFICATIONS
      // Email
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com", port: 465, secure: true,
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Appointment Moved - Dr. Dixit Ayurveda`,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                  <h2>Namaste ${patientData.name},</h2>
                  <p>Your session has been moved to: <b>${timeStr}</b></p>
                  <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
                  <p style="margin-top:20px; font-size:12px;">Need to change this? <a href="${rescheduleUrl}">Reschedule here</a></p>
                </div>`
        });
      } catch (e) { console.error("Email failed"); }

      // WhatsApp
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPatientPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your session is moved to ${timeStr}.\n\nMeeting Link: ${process.env.NEXT_PUBLIC_MEET_LINK}\n\nReschedule: ${rescheduleUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${formattedPatientPhone}`
        });
      } catch (e) { console.error("WhatsApp failed"); }
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response('Error', { status: 500 });
  }
}