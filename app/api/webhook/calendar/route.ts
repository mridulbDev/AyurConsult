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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 30000).toISOString(),
      singleEvents: true,
    });

    const event = list.data.items?.find(ev => ev.summary?.startsWith('CONFIRMED'));
    if (!event || !event.description) return new Response('OK', { status: 200 });

    const patientData = JSON.parse(event.description);
    if (patientData.lastUpdatedBy === 'system') {
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) }
      });
      return new Response('OK', { status: 200 });
    }

    // DOCTOR MANUAL MOVE
    const overlaps = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: event.start?.dateTime!,
      timeMax: event.end?.dateTime!,
      singleEvents: true,
    });
    for (const item of (overlaps.data.items || [])) {
      if (item.summary === 'Available' && item.id !== event.id) await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
    }

    // Reset limit and link
    const updatedData = { ...patientData, rescheduled: false, lastUpdatedBy: 'system' };
    const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;
    
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: event.id!,
      requestBody: { description: JSON.stringify(updatedData) }
    });

    const timeStr = new Date(event.start?.dateTime!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: patientData.email,
      subject: `Rescheduled by Dr. Dixit`,
      html: `<div style="font-family:sans-serif; padding:20px;">
        <h2>Appointment Updated</h2>
        <p>Namaste ${patientData.name}, Dr. Dixit has moved your session to: <b>${timeStr}</b></p>
        <p><a href="${meetLink}" style="background:#123025; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Video Call</a></p>
        <p>If you need to change this, use your link: <a href="${reschedUrl}">${reschedUrl}</a></p>
      </div>`
    });

    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await twilioClient.messages.create({
      body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n\n📅 New Time: ${timeStr}\n🔗 Link: ${meetLink}\n\nYou can move this once more here: ${reschedUrl}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
    });

    return new Response('OK', { status: 200 });
  } catch (e) {
    return new Response('OK', { status: 200 });
  }
}