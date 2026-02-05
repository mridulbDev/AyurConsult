import { google } from 'googleapis';
import crypto from 'crypto';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('hex');

    if (signature !== expectedSignature) return new Response('Unauthorized', { status: 400 });

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
    const patientData = JSON.parse(event.data.description || '{}');
    const start = event.data.start?.dateTime;

    // STEP 1: Finalize the description and confirm slot
    const finalDesc = JSON.stringify({
      ...patientData,
      rescheduled: false,
      lastUpdatedBy: 'SYSTEM',
      lastNotifiedTime: start
    });

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    // Formatting for notifications
    const timeStr = new Date(start!).toLocaleString('en-IN', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
    });
    const rescheduleUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    // 1. Email to Patient
    const transporter = nodemailer.createTransport({ 
      service: 'gmail', 
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
    });
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: patientData.email,
      subject: `Booking Confirmed - Dr. Dixit`,
      html: `<div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 8px;">
              <h2>Namaste ${patientData.name},</h2>
              <p>Your session is confirmed for: <b>${timeStr}</b></p>
              <p><a href="${meetLink}" style="background: #123025; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Video Call</a></p>
              <p style="margin-top: 20px; font-size: 12px;">Need to reschedule? <a href="${rescheduleUrl}">Click here</a></p>
            </div>`
    });

    // 2. WhatsApp to Patient
    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await twilioClient.messages.create({
      body: `Namaste ${patientData.name}, booking confirmed! 🌿\n\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}\n🔄 Reschedule: ${rescheduleUrl}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
    });

    // 3. WhatsApp to Doctor
    await twilioClient.messages.create({
      body: `🔔 New Booking Confirmed\n\n👤 Patient: ${patientData.name}\n📅 Time: ${timeStr}\n📝 Symptoms: ${patientData.symptoms}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${process.env.DOCTOR_PHONE?.slice(-10)}`
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    return new Response('Internal Error', { status: 200 });
  }
}