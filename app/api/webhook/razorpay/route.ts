import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    // 1. Verify Signature manually for maximum reliability in Next.js
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return new Response('Invalid Signature', { status: 400 });
    }

    const data = JSON.parse(body);
    const payment = data.payload.payment.entity;
    
    // We only care about successful captures
    if (data.event !== 'payment.captured') return new Response('OK', { status: 200 });

    const bookingId = payment.notes?.booking_id; 
    if (!bookingId) return new Response('No Booking ID', { status: 200 });

    // 2. Google Calendar Auth
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // 3. Update Calendar Event
    const event = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: bookingId });
    if (!event) return new Response('Event not found', { status: 200 });

    const patientData = JSON.parse(event.data.description || '{}');
    const update = await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      conferenceDataVersion: 1,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        description: `Phone: ${patientData.phone}\nSymptoms: ${patientData.symptoms}\nHistory: ${patientData.history}`,
        conferenceData: { createRequest: { requestId: bookingId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
      }
    });

    const meetLink = update.data.hangoutLink;
    const reschedParams = new URLSearchParams({ reschedule: bookingId });
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?${reschedParams.toString()}`;

    // 4. Notifications
    try {
      // WhatsApp (Twilio)
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, session confirmed! \nLink: ${meetLink} \nReschedule: ${rescheduleLink}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${patientData.phone}`
      });

      // Email (Nodemailer)
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Booking Confirmed - ${patientData.name}`,
        html: `<p>Namaste ${patientData.name},</p><p>Link: <a href="${meetLink}">${meetLink}</a></p>`
      });
    } catch (e) { console.error("Notification Error:", e); }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response('Internal Error', { status: 500 });
  }
}