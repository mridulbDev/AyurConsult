import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

console.log("Razorpay Webhook Hit");

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (signature !== expectedSignature) return new Response('Unauthorized', { status: 400 });

    const data = JSON.parse(body);
    if (data.event !== 'payment.captured') return new Response('OK');

    const bookingId = data.payload.payment.entity.notes?.booking_id;
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
    const patientData = JSON.parse(event.data.description || '{}');
    const start = event.data.start?.dateTime;
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK!;

    const finalDesc = JSON.stringify({
      ...patientData,
      rescheduled: false,
      lastUpdatedBy: 'system',
      lastNotifiedTime: start
    });

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: meetLink,
        description: finalDesc
      }
    });

    const timeStr = new Date(start!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: patientData.email,
      subject: `Consultation Confirmed - ${patientData.name}`,
      html: `<h2>Namaste ${patientData.name}</h2>
             <p>Your session is confirmed for: <b>${timeStr}</b></p>
             <p><a href="${meetLink}">Join Meeting</a></p>
             <p><a href="${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}">Reschedule Link</a></p>`
    });

    return new Response('OK');
  } catch (error) {
    return new Response('Error', { status: 500 });
  }
}