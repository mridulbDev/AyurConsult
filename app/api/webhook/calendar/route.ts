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

    // Google Webhook headers
    const resourceUri = req.headers.get('x-goog-resource-uri');
    const resourceState = req.headers.get('x-goog-resource-state');

    // 1. Initial Handshake & Validation
    if (resourceState === 'sync' || !resourceUri) return new Response('OK', { status: 200 });

    // Extract exactly which event was moved
    const parts = resourceUri.split('/');
    const eventId = parts[parts.length - 1];

    await delay(2000); 

    // 2. Fetch the specific event directly using ID
    const { data: event } = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId: eventId,
    });

    // Only proceed if it's a confirmed patient booking
    if (!event.summary?.includes('CONFIRMED') || !event.description || !event.start?.dateTime) {
      return new Response('OK');
    }

    const patientData = JSON.parse(event.description);
    const newStart = event.start.dateTime;

    // 🛑 LOOP PROTECTION: Don't trigger if the time hasn't actually changed
    if (patientData.lastNotifiedTime === newStart) {
        return new Response('OK');
    }

    // --- 3. THE "REPLACE" FEATURE (FIX OVERLAP) ---
    // Fetch events for the day to find the "Available" slot sitting under our moved event
    const dayStart = new Date(newStart); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(newStart); dayEnd.setHours(23,59,59,999);

    const dayList = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
    });

    const ghostSlot = dayList.data.items?.find(e => 
      e.summary === 'Available' && e.start?.dateTime === newStart
    );

    if (ghostSlot) {
      console.log("Physical overlap found. Deleting 'Available' slot...");
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghostSlot.id! });
    }

    // --- 4. TRIGGER EMAIL & WHATSAPP ---
    const timeStr = new Date(newStart).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    const reschedUrl = `${baseUrl}/consultation?reschedule=${eventId}`;

    // Email
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Moved - Dr. Dixit Ayurveda`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
            <h2>Namaste ${patientData.name},</h2>
            <p>Your appointment has been moved to a new slot: <b>${timeStr}</b></p>
            <p><a href="${meetLink}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
            <hr style="border:none; border-top:1px solid #eee; margin:20px 0;"/>
            <p style="font-size: 11px;">If you need to change this, use your link: <a href="${reschedUrl}">${reschedUrl}</a></p>
          </div>`
      });
    } catch (e) { console.error("Email failed", e); }

    // WhatsApp
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, your session is moved to ${timeStr}.\n🔗 Link: ${meetLink}\nManage: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (e) { console.error("WhatsApp failed", e); }

    // --- 5. FINALIZE: Reset limit and update state ---
    // We set rescheduled: false so the patient can move it again after the doctor moves it.
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: eventId,
      requestBody: { 
        description: JSON.stringify({ 
          ...patientData, 
          rescheduled: false, 
          lastNotifiedTime: newStart 
        }) 
      }
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Critical Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}