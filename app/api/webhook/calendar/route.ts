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

    const resourceUri = req.headers.get('x-goog-resource-uri');
    const resourceState = req.headers.get('x-goog-resource-state');

    if (resourceState === 'sync' || !resourceUri) return new Response('OK');

    const parts = resourceUri.split('/');
    const eventId = parts[parts.length - 1];

    await delay(2500); 

    const { data: event } = await calendar.events.get({
      calendarId: CALENDAR_ID,
      eventId: eventId,
    });

    // Ensure we have a confirmed event and valid timestamps to avoid red lines
    if (!event.summary?.includes('CONFIRMED') || !event.description || !event.start?.dateTime || !event.end?.dateTime) {
      return new Response('OK');
    }

    const patientData = JSON.parse(event.description);
    const newStart = event.start.dateTime;
    const newEnd = event.end.dateTime;

    // 🛑 TRIGGER FIX: If time is same, doctor didn't move it
    if (patientData.lastNotifiedTime === newStart) return new Response('OK');

    // 2. REPLACE LOGIC: Check exactly where the event landed
    try {
      const slotCheck = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: newStart,
        timeMax: newEnd,
        singleEvents: true,
      });

      // Find any 'Available' slot sitting exactly at the new drop location
      const ghostSlots = (slotCheck.data.items || []).filter(item => 
        item.summary === 'Available' && item.id !== eventId
      );

      for (const slot of ghostSlots) {
        if (slot.id) {
          console.log("Replacing Available slot...");
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id });
        }
      }
    } catch (cleanupErr) {
      console.error("Cleanup failed:", cleanupErr);
    }

    // 3. TRIGGER NOTIFICATIONS
    const timeStr = new Date(newStart).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    
    // Email
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Update - Dr. Dixit Ayurveda`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
            <h2>Namaste ${patientData.name},</h2>
            <p>Your session has been moved to: <b>${timeStr}</b></p>
            <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}" style="background:#123025; color:white; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
          </div>`
      });
    } catch (e) { console.error("Email failed", e); }

    // WhatsApp
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, your session is moved to ${timeStr}. Link: ${process.env.NEXT_PUBLIC_MEET_LINK}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (e) { console.error("WhatsApp failed", e); }

    // 4. UPDATE EVENT: Mark as notified to stop loop
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