import { google } from 'googleapis';
import { kv } from '@vercel/kv';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

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

    // 1. Get the last stored token
    const syncToken = await kv.get<string>('google_calendar_sync_token');

    // 2. Fetch changes
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken: syncToken || undefined,
    });

    // 3. Immediately store the NEW token for the next trigger
    if (response.data.nextSyncToken) {
      await kv.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      if (!newStart) continue;

      if (patientData.lastNotifiedTime === newStart) continue;

      // 4. SLOT REPLACEMENT: Remove "Available" slot at the new location
      try {
        const checkSlots = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: newStart,
          timeMax: event.end?.dateTime!,
          singleEvents: true,
        });

        const ghostSlot = checkSlots.data.items?.find(e => 
          e.summary === 'Available' && e.start?.dateTime === newStart && e.id !== event.id
        );

        if (ghostSlot) {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghostSlot.id! });
        }
      } catch (err) { console.log("Slot cleanup skipped or failed"); }

      // 5. CONSTRUCT LINKS
      const timeStr = new Date(newStart).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
      
      // Dynamic Reschedule Link
      const rescheduleUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

      // 6. NOTIFICATIONS
      // Email
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Appointment Updated - Dr. Dixit Ayurveda`,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
              <h2>Namaste ${patientData.name},</h2>
              <p>Your session has been moved to: <b>${timeStr}</b></p>
              <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}" style="display:inline-block; background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
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
          to: formattedPatientPhone
        });
      } catch (e) { console.error("WhatsApp failed"); }

      // 7. UPDATE EVENT: Save state & RESET reschedule flag so patient can move it once more
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...patientData, 
            lastNotifiedTime: newStart, 
            rescheduled: false,
            lastUpdatedBy: 'doctor' // Resetting this allows the patient to reschedule again after a Dr move
          }) 
        }
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    if (error.code === 410) {
      await kv.del('google_calendar_sync_token');
      return new Response('Sync Reset', { status: 200 });
    }
    console.error("Critical Webhook Error:", error);
    return new Response('Internal Error', { status: 500 });
  }
}