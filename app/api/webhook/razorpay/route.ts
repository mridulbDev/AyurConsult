import { google } from 'googleapis';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    
    if (!validateWebhookSignature(body, signature, secret)) {
      return new Response('Unauthorized', { status: 400 });
    }

    const payload = JSON.parse(body);
    if (payload.event !== 'payment.captured') return new Response('OK', { status: 200 });

    const bookingId = payload.payload.payment.entity.notes?.booking_id;
    if (!bookingId) return new Response('No Booking ID', { status: 200 });

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
    const storedData = JSON.parse(event.data.description || '{}');
    const start = event.data.start?.dateTime;

    const finalDesc = JSON.stringify({
      ...storedData,
      rescheduled: false,
      lastUpdatedBy: 'SYSTEM', 
      lastNotifiedTime: start
    });

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${storedData.firstName} ${storedData.lastName}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    const timeStr = new Date(start!).toLocaleString('en-IN', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
    });
    const rescheduleUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    // Notification Logic
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: storedData.email,
      subject: `Booking Confirmed - Dr. Dixit Ayurveda`,
      html: `<h2>Namaste ${storedData.firstName},</h2><p>Confirmed for <b>${timeStr}</b>. <br><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting</a><br>Reschedule: <a href="${rescheduleUrl}">Link</a></p>`
    });

    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await twilioClient.messages.create({
      body: `Namaste ${storedData.firstName}, confirmed! 🌿\n📅 ${timeStr}\n🔗 Join: ${process.env.NEXT_PUBLIC_MEET_LINK}\n🔄 Reschedule: ${rescheduleUrl}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${storedData.mobile.toString().slice(-10)}`
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response('Error', { status: 200 }); 
  }
}