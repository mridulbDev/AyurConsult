import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (signature !== expectedSignature) return new Response('Invalid Signature', { status: 400 });
    const data = JSON.parse(body);
    if (data.event !== 'payment.captured') return new Response('OK', { status: 200 });

    const bookingId = data.payload.payment.entity.notes?.booking_id;
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const eventRes = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: bookingId });
    const start = eventRes.data.start?.dateTime;
    const patientData = JSON.parse(eventRes.data.description || '{}');
    const timeStr = new Date(start!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    const reschedUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: JSON.stringify({ ...patientData, rescheduled: false, lastUpdatedBy: 'system_webhook', lastNotifiedTime: start })
      }
    });

    // Final Notifications
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda"`,
      to: patientData.email,
      subject: `Consultation Confirmed - ${patientData.name}`,
      html: `<p>Namaste ${patientData.name},your appointment is confirmed for <b>${timeStr}</b> with Dr. Dixit.</p><p><a href="${reschedUrl}">Reschedule Link</a></p>`
    });

    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
    await twilioClient.messages.create({
      body: `Namaste ${patientData.name}, your appointment is confirmed for ${timeStr} with Dr. Dixit. Reschedule: ${reschedUrl}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:${cleanPhone.startsWith('91') ? '+' + cleanPhone : '+91' + cleanPhone}`
    });

    return new Response('OK', { status: 200 });
  } catch (error) { return new Response('Internal Error', { status: 500 }); }
}