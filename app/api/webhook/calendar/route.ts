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

    await delay(2500); // Wait for Google to register the move

    // 1. Get all events for the current window to find overlaps
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date(Date.now() - 86400000).toISOString(), // Check 24h window
      singleEvents: true,
    });

    const allEvents = list.data.items || [];

    // 2. Identify the Confirmed event and any Available slot at the same time
    const confirmedEvents = allEvents.filter(e => e.summary?.includes('CONFIRMED'));
    
    for (const confEvent of confirmedEvents) {
      const startTime = confEvent.start?.dateTime;
      if (!startTime) continue;

      // Check if this Confirmed event is sitting on an "Available" slot
      const overlappingAvailable = allEvents.find(e => 
        e.summary === 'Available' && 
        e.start?.dateTime === startTime && 
        e.id !== confEvent.id
      );

      if (overlappingAvailable) {
        console.log("Overlap detected. Replacing slot...");

        // A. Delete the Available slot immediately
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: overlappingAvailable.id! });

        // B. Parse Patient Data
        const patientData = JSON.parse(confEvent.description || '{}');

        // C. Send Notifications
        const timeStr = new Date(startTime).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
        });
        const reschedUrl = `${baseUrl}/consultation?reschedule=${confEvent.id}`;

        // Nodemailer
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Rescheduled: Your Appointment with Dr. Dixit`,
          html: `<div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee;">
              <h2>Namaste ${patientData.name},</h2>
              <p>Dr. Dixit has adjusted your consultation time to: <b>${timeStr}</b></p>
              <p><a href="${meetLink}" style="background:#123025; color:white; padding:12px 25px; text-decoration:none; border-radius:5px; font-weight:bold;">Join Video Call</a></p>
              <p><b>Details:</b><br/>Symptoms: ${patientData.symptoms || 'N/A'}</p>
              <hr style="border:none; border-top:1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">Need to move this? Use your link: <a href="${reschedUrl}">${reschedUrl}</a></p>
            </div>`
        });

        // WhatsApp
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}\n🔗 Manage: ${reschedUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
        });

        // D. Reset patient's reschedule limit and mark as system updated
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId: confEvent.id!,
          requestBody: { 
            description: JSON.stringify({ 
              ...patientData, 
              rescheduled: false, // Allows patient to reschedule again
              lastUpdatedBy: 'system' 
            }) 
          }
        });
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Critical Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}