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

    // 1. Skip sync notifications
    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    // 2. Fetch changes since last sync
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
      // Only process confirmed events with existing patient data
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      const newEnd = event.end?.dateTime;
      if (!newStart || !newEnd) continue;

      // 🚩 FIX 1: LOOP PREVENTION
      // If we are the ones who just updated this, STOP here to avoid double emails.
      if (patientData.lastNotifiedTime === newStart && patientData.lastUpdatedBy === 'system_webhook') {
        continue;
      }

      // 🚩 FIX 2: OVERLAP CLEANUP
      // Delete any "Available" slots that are now sitting under the moved event.
      try {
        const checkSlots = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: newStart,
          timeMax: newEnd,
          singleEvents: true,
        });

        const ghostSlots = checkSlots.data.items?.filter(e => 
          e.summary === 'Available' && e.id !== event.id
        );

        if (ghostSlots && ghostSlots.length > 0) {
          for (const slot of ghostSlots) {
            await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
          }
        }
      } catch (err) {
        console.error("Cleanup failed:", err);
      }

      // 🚩 FIX 3: RESET RESCHEDULE STATUS
      // Since the DOCTOR moved it, the patient gets their 1-time reschedule right back.
      const timeStr = new Date(newStart).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
      const rescheduleUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

      // Update description FIRST to "lock" the event before sending notifications
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...patientData, 
            lastNotifiedTime: newStart, 
            lastUpdatedBy: 'system_webhook', 
            rescheduled: false // Doctor moved it, so patient can reschedule again.
          }) 
        }
      });

      // 4. SEND NOTIFICATIONS (Now only triggers once)
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Appointment Updated - ${patientData.name}`,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                  <h2>Appointment Moved</h2>
                  <p>Namaste ${patientData.name}, your session has been moved to: <b>${timeStr}</b></p>
                  <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
                  <p style="margin-top:20px; font-size: 12px;">Need to change this? <a href="${rescheduleUrl}">Reschedule once here</a></p>
                </div>`
        });

        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;
        
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your session is moved to ${timeStr}.\n\nMeeting: ${process.env.NEXT_PUBLIC_MEET_LINK}\n\nReschedule: ${rescheduleUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${formattedPhone}`
        });
      } catch (e) { console.error("Notification Error"); }
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    return new Response('Error', { status: 500 });
  }
}