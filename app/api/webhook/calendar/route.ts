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

    // 1. Get the last 3 updated events (more reliable than a time filter)
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      maxResults: 3,
      orderBy: 'updated',
      singleEvents: true,
      showDeleted: false
    });

    // Find any event that is a CONFIRMED appointment
    const event = list.data.items?.find(ev => ev.summary?.includes('CONFIRMED'));

    if (event && event.description) {
      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch (e) {
        return new Response('Not a JSON event', { status: 200 });
      }

      // 🛑 LOOP PREVENTION
      if (patientData.lastUpdatedBy === 'system') return new Response('OK', { status: 200 });

      const start = event.start?.dateTime;
      const end = event.end?.dateTime;

      // 2. CLEANUP OVERLAPS
      if (start && end) {
        const overlaps = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: start,
          timeMax: end,
          singleEvents: true,
        });
        for (const item of (overlaps.data.items || [])) {
          // Delete 'Available' slots that the doctor just moved the appointment onto
          if (item.summary === 'Available' && item.id !== event.id) {
            await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
          }
        }
      }

      // 3. RESET RESCHEDULE FLAG (Since Doctor moved it, Patient gets 1 new move)
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
      const timeStr = start ? new Date(start).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      }) : "New Time";

      // WhatsApp
      if (patientData.phone && process.env.TWILIO_SID) {
        try {
          const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
          const phone = `whatsapp:+91${patientData.phone.toString().replace(/\D/g, '').slice(-10)}`;
          await twilioClient.messages.create({
            body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n\n📅 New Time: ${timeStr}\n🔗 Link: ${meetLink}`,
            from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
            to: phone
          });
        } catch (e) { console.error("Twilio Error", e); }
      }

      // Email
      if (patientData.email && process.env.EMAIL_PASS) {
        try {
          const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientData.email,
            subject: `Rescheduled: Your Consultation with Dr. Dixit`,
            html: `<p>Namaste ${patientData.name}, your session has been moved to <b>${timeStr}</b>.</p><p><a href="${meetLink}">Join Call</a></p>`
          });
        } catch (e) { console.error("Email Error", e); }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response('Error', { status: 500 });
  }
}