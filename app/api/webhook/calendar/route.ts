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
      // Logic: Only process events that are CONFIRMED and have patient data
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch (e) { continue; }

      const newStart = event.start?.dateTime;
      if (!newStart || patientData.lastNotifiedTime === newStart) continue;

      // --- FIXED OVERLAP CLEANUP ---
      try {
        const checkSlots = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: new Date(new Date(newStart).getTime() - 1000).toISOString(),
          timeMax: new Date(new Date(event.end?.dateTime!).getTime() + 1000).toISOString(),
          singleEvents: true,
        });

        // Delete ANY 'Available' slot in this new window
        const overlaps = checkSlots.data.items?.filter(e => e.summary === 'Available' && e.id !== event.id);
        if (overlaps) {
          for (const slot of overlaps) {
            await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
          }
        }
      } catch (err) { console.log("Cleanup failed"); }

      const timeStr = new Date(newStart).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
      
      const rescheduleUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

      // --- FIXED EMAIL TRANSPORT ---
      try {
        const transporter = nodemailer.createTransport({
          host: "smtp.gmail.com",
          port: 465,
          secure: true,
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Appointment Updated - Dr. Dixit Ayurveda`,
          html: `<p>Namaste ${patientData.name}, your session is moved to: <b>${timeStr}</b></p>
                 <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting</a></p>
                 <p>Reschedule: ${rescheduleUrl}</p>`
        });
      } catch (e) { console.error("Email fail"); }

      // --- FIXED WHATSAPP (Added Prefix) ---
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPatientPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;
        
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your session moved to ${timeStr}.\nMeet: ${process.env.NEXT_PUBLIC_MEET_LINK}\nReschedule: ${rescheduleUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${formattedPatientPhone}` // Fixed prefix
        });
      } catch (e) { console.error("WhatsApp fail"); }

      // Save state
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ ...patientData, lastNotifiedTime: newStart, rescheduled: false }) 
        }
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error("Webhook Error:", error);
    return new Response('Error', { status: 500 });
  }
}