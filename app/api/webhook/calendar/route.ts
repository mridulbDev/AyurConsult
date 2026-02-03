import { google } from 'googleapis';
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
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    // 1. Get the most recently changed event
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 30000).toISOString(), // Narrowed to 30s
      singleEvents: true,
      showDeleted: false
    });

    const event = list.data.items?.find(ev => ev.summary?.startsWith('CONFIRMED'));

    if (event && event.description) {
      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch (e) {
        return new Response('Not a JSON event', { status: 200 });
      }

      // 🛑 STOP INFINITE LOOP
      // If the last update was made by this script, ignore it.
      if (patientData.lastUpdatedBy === 'system') {
        console.log("Skipping system-generated update to prevent loop.");
        return new Response('OK', { status: 200 });
      }

      const start = event.start?.dateTime;
      const end = event.end?.dateTime;

      // 2. CLEANUP OVERLAPS (Delete the "Available" slot at the new time)
      if (start && end) {
        const overlaps = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: start,
          timeMax: end,
          singleEvents: true,
        });
        for (const item of (overlaps.data.items || [])) {
          if (item.summary === 'Available' && item.id !== event.id) {
            await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
          }
        }
      }

      // 3. UPDATE THE EVENT (Unlock for patient & Mark as System)
      patientData.rescheduled = false; 
      patientData.lastUpdatedBy = 'system'; 

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          summary: `CONFIRMED: ${patientData.name}`,
          description: JSON.stringify(patientData) 
        }
      });

      // 4. NOTIFICATIONS
      const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
      const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' };
      const newTimeRange = start 
        ? `${new Date(start).toLocaleString('en-IN', dateOptions)}, ${new Date(start).toLocaleTimeString('en-IN', timeOptions)}`
        : "New Time";

      // Email Logic
      if (patientData.email && process.env.EMAIL_PASS) {
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
          });
          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientData.email,
            subject: `Rescheduled: Your Consultation with Dr. Dixit`,
            html: `<div style="font-family:sans-serif; border:1px solid #eee; padding:20px;">
              <h2 style="color:#123025;">Appointment Updated</h2>
              <p>Namaste ${patientData.name},</p>
              <p>Your session has been moved to: <strong>${newTimeRange}</strong></p>
              <p><a href="${meetLink}" style="background:#123025; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Video Call</a></p>
            </div>`
          });
        } catch (e) { console.error("Email fail", e); }
      }

      // WhatsApp Logic
      if (patientData.phone && process.env.TWILIO_SID) {
        try {
          const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
          const formattedPhone = `whatsapp:+91${patientData.phone.toString().replace(/\D/g, '').slice(-10)}`;
          await twilioClient.messages.create({
            body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n\n📅 New Time: ${newTimeRange}\n🔗 Link: ${meetLink}`,
            from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
            to: formattedPhone
          });
        } catch (e) { console.error("Twilio fail", e); }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response('Error', { status: 500 });
  }
}