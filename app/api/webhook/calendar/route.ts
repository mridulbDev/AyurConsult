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

    // 1. Wait for Google to index the move
    await delay(2500);

    // 2. Fetch recently updated events
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 120000).toISOString(),
      singleEvents: true,
      orderBy: 'updated',
    });

    const items = list.data.items || [];
    const event = items.reverse().find(ev => ev.summary?.includes('CONFIRMED'));
    
    if (!event || !event.description || !event.start?.dateTime) return new Response('OK', { status: 200 });

    const patientData = JSON.parse(event.description);

    // 🛑 LOOP PROTECTION
    // Skip if we (the system) were the last ones to touch this event
    if (patientData.lastUpdatedBy === 'system') {
      console.log("System update detected, resetting flag only.");
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) }
      });
      return new Response('OK', { status: 200 });
    }

    const start = event.start.dateTime;

    // --- 3. REPLACE LOGIC: CLEAN OVERLAPS ---
    // Look for any 'Available' event starting at the EXACT same time
    const dayStart = new Date(start); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(start); dayEnd.setHours(23,59,59,999);

    const dayList = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
    });

    const duplicate = dayList.data.items?.find(
      item => item.summary === 'Available' && item.start?.dateTime === start
    );

    if (duplicate) {
      console.log("Deleting overlapping Available slot...");
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: duplicate.id! });
    }

    // --- 4. SEND NOTIFICATIONS ---
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
        subject: `Appointment Update - Dr. Dixit Ayurveda`,
        html: `<div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee;">
            <h2>Namaste ${patientData.name},</h2>
            <p>Dr. Dixit has adjusted your consultation time to: <b>${timeStr}</b></p>
            <p><a href="${meetLink}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Video Call</a></p>
            <p><b>Symptoms:</b> ${patientData.symptoms || 'N/A'}</p>
            <p style="font-size: 11px;">Manage booking: <a href="${reschedUrl}">${reschedUrl}</a></p>
          </div>`
      });
    } catch (e) { console.error("Email fail:", e); }

    // WhatsApp
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (e) { console.error("WhatsApp fail:", e); }

    // 5. FINAL PATCH (Mark as system to stop loop)
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: event.id!,
      requestBody: { 
        description: JSON.stringify({ ...patientData, lastUpdatedBy: 'system' }) 
      }
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Critical Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}