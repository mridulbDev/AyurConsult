import { google } from 'googleapis';
import crypto from 'crypto';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');

    if (signature !== expected) return new Response('Unauthorized', { status: 400 });

    const payload = JSON.parse(body);
    if (payload.event !== 'payment.captured') return new Response('OK', { status: 200 });

    const bookingId = payload.payload.payment.entity.notes?.booking_id;
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
    const data = JSON.parse(event.data.description || '{}');
    const start = event.data.start?.dateTime;

    const finalDesc = JSON.stringify({
      ...data,
      rescheduled: false,
      lastUpdatedBy: 'SYSTEM',
      lastNotifiedTime: start
    });

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${data.name}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    // Notify Patient
    const timeStr = new Date(start!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const rescheduleUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;
    
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: data.email,
      subject: `Booking Confirmed - Dr. Dixit`,
      html: `<p>Namaste, your session is confirmed for <b>${timeStr}</b>. <br>Join Link: ${process.env.NEXT_PUBLIC_MEET_LINK} <br>Reschedule: <a href="${rescheduleUrl}">Link</a></p>`
    });

    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await twilioClient.messages.create({
      body: `Confirmed! 🌿 Session on ${timeStr}.\nJoin: ${process.env.NEXT_PUBLIC_MEET_LINK}\nReschedule: ${rescheduleUrl}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${data.phone.toString().slice(-10)}`
    });

    return new Response('OK', { status: 200 });
  } catch (error) { return new Response('Error', { status: 200 }); }
}