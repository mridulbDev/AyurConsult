import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK');

    // Wait for Google to finalize the move
    await delay(2500);

    // 1. Get all events for the day to check physical overlaps
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date(Date.now() - 86400000).toISOString(), 
      singleEvents: true,
    });

    const allEvents = list.data.items || [];
    const confirmedEvents = allEvents.filter(e => e.summary?.includes('CONFIRMED'));

    for (const confEvent of confirmedEvents) {
      const patientData = JSON.parse(confEvent.description || '{}');
      
      // 🛑 LOOP PROTECTION: Check if we already handled this specific move
      // We check if the current start time matches the one we last notified for
      if (patientData.lastNotifiedTime === confEvent.start?.dateTime) continue;

      const startTime = confEvent.start?.dateTime;
      if (!startTime) continue;

      // 2. REPLACE LOGIC: Search for 'Available' slot at the NEW time
      const overlappingAvailable = allEvents.find(e => 
        e.summary === 'Available' && 
        e.start?.dateTime === startTime && 
        e.id !== confEvent.id
      );

      // 3. TRIGGER NOTIFICATION (Whether it replaced a slot or moved to free time)
      // We trigger this because the loop protection above ensures we only fire on a NEW move
      console.log(`Move detected for ${patientData.name}. Notifying...`);

      if (overlappingAvailable) {
        console.log("Replacing existing Available slot.");
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: overlappingAvailable.id! });
      } else {
        console.log("Moved to free time (no Available slot to delete).");
      }

      const timeStr = new Date(startTime).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
      });
      const reschedUrl = `${baseUrl}/consultation?reschedule=${confEvent.id}`;

      // Email
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Rescheduled: Your Appointment with Dr. Dixit`,
          html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
              <h2>Namaste ${patientData.name},</h2>
              <p>Your appointment has been moved to: <b>${timeStr}</b></p>
              <p><a href="${meetLink}" style="background:#123025; color:white; padding:12px 25px; text-decoration:none; border-radius:5px;">Join Video Call</a></p>
              <p style="font-size: 12px;">Manage: <a href="${reschedUrl}">${reschedUrl}</a></p>
            </div>`
        });
      } catch (e) { console.error("Email error"); }

      // WhatsApp
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
        });
      } catch (e) { console.error("WhatsApp error"); }

      // 4. UPDATE EVENT: Mark this time as "Notified" and reset patient's reschedule limit
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: confEvent.id!,
        requestBody: { 
          description: JSON.stringify({ 
            ...patientData, 
            rescheduled: false, 
            lastNotifiedTime: startTime // This prevents the double-email loop
          }) 
        }
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}