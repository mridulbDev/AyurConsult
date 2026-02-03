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

    // Give Google time to index the move
    await delay(1500);

    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 60000).toISOString(), // Look back 1 minute
      singleEvents: true,
      orderBy: 'updated',
    });

    const event = list.data.items?.reverse().find(ev => ev.summary?.includes('CONFIRMED'));
    
    if (!event || !event.description) return new Response('OK', { status: 200 });

    const patientData = JSON.parse(event.description);

    // 🛑 CORRECTED LOOP PROTECTION
    // If we just updated this to "system", we skip to avoid double emailing.
    if (patientData.lastUpdatedBy === 'system') {
      console.log("Internal system update, skipping notification...");
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) }
      });
      return new Response('OK', { status: 200 });
    }

    const start = event.start?.dateTime;
    const end = event.end?.dateTime;
    if (!start || !end) return new Response('OK', { status: 200 });

    // --- 1. NOTIFICATIONS (Run this FIRST) ---
    const timeStr = new Date(start).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Update - Dr. Dixit Ayurveda`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee;">
            <h2>Namaste ${patientData.name},</h2>
            <p>Dr. Dixit has adjusted your consultation time.</p>
            <p style="font-size: 18px;"><b>New Time: ${timeStr}</b></p>
            <div style="margin: 20px 0;">
              <a href="${meetLink}" style="background: #123025; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px;">Join Video Call</a>
            </div>
            <p><b>Your Details:</b><br/>Symptoms: ${patientData.symptoms || 'N/A'}<br/>History: ${patientData.history || 'N/A'}</p>
            <hr/>
            <p style="font-size: 11px;">View/Reschedule: <a href="${reschedUrl}">${reschedUrl}</a></p>
          </div>`
      });

      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}\n🔗 Manage: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (err) { console.error("Notification Error:", err); }

    // --- 2. CLEAR OVERLAPS (Box on Box Fix) ---
    // Search slightly wider (1 min) to catch the "Available" slot underneath
    const searchMin = new Date(new Date(start).getTime() - 30000).toISOString();
    const searchMax = new Date(new Date(end).getTime() + 30000).toISOString();

    const overlaps = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: searchMin,
      timeMax: searchMax,
      singleEvents: true,
    });

    for (const item of (overlaps.data.items || [])) {
      if (item.summary === 'Available' && item.id !== event.id) {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
      }
    }

    // --- 3. FINAL PATCH (Reset Flag & Set System) ---
    const updatedData = { 
      ...patientData, 
      rescheduled: false, 
      lastUpdatedBy: 'system' 
    };

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: event.id!,
      requestBody: { description: JSON.stringify(updatedData) }
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response('Error', { status: 200 });
  }
}