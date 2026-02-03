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

    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    // 1. Wait a bit longer to ensure Google's internal index is updated
    await delay(3000);

    // 2. Get recently updated events
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 120000).toISOString(), // Check last 2 mins
      singleEvents: true,
      orderBy: 'updated',
    });

    const items = list.data.items || [];
    const event = items.reverse().find(ev => ev.summary?.includes('CONFIRMED'));
    
    if (!event || !event.description || !event.start?.dateTime) {
      return new Response('OK', { status: 200 });
    }

    let patientData;
    try {
      patientData = JSON.parse(event.description);
    } catch (e) {
      console.error("JSON Parse Error:", e);
      return new Response('OK', { status: 200 });
    }

    // 🛑 LOOP PROTECTION: 
    // If 'system' updated this, we reset it to 'doctor' but DO NOT send notifications.
    if (patientData.lastUpdatedBy === 'system') {
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) 
        }
      });
      return new Response('OK', { status: 200 });
    }

    // --- DOCTOR MANUAL MOVE LOGIC ---
    const start = event.start.dateTime;

    // 3. CLEAN OVERLAPS: Fetch all events at the exact new start time
    const overlapCheck = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: start,
      timeMax: new Date(new Date(start).getTime() + 1000).toISOString(), // 1 second window
      singleEvents: true,
    });

    for (const item of (overlapCheck.data.items || [])) {
      // If there's an 'Available' slot precisely where the 'Confirmed' event landed, DELETE IT
      if (item.summary === 'Available' && item.id !== event.id) {
        console.log("Cleanup: Deleting overlapping available slot");
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
      }
    }

    // 4. SEND NOTIFICATIONS (Before the final patch to ensure they go out)
    const timeStr = new Date(start).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

    // Gmail
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Update: Rescheduled by Doctor`,
        html: `<div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee;">
            <h3>Namaste ${patientData.name},</h3>
            <p>Your session has been moved to: <b>${timeStr}</b></p>
            <p><a href="${meetLink}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Video Call</a></p>
            <hr/>
            <p><b>Symptoms:</b> ${patientData.symptoms || 'None recorded'}</p>
            <p style="font-size: 11px;">Reschedule Link: <a href="${reschedUrl}">${reschedUrl}</a></p>
          </div>`
      });
    } catch (e) { console.error("Email Error:", e); }

    // WhatsApp
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}\n🔗 Link: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (e) { console.error("WhatsApp Error:", e); }

    // 5. FINAL PATCH (Set to 'system' to prevent loop)
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: event.id!,
      requestBody: { 
        description: JSON.stringify({ ...patientData, rescheduled: false, lastUpdatedBy: 'system' }) 
      }
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Critical Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}