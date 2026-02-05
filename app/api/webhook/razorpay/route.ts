import { google } from 'googleapis';

import twilio from 'twilio';
import nodemailer from 'nodemailer';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';


export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature || !secret) {
      return new Response('Missing signature or secret', { status: 400 });
    }

    // 2. Validate signature using Razorpay's official utility
    const isValid = validateWebhookSignature(rawBody, signature, secret);

    if (!isValid) {
      console.error("Invalid Razorpay Signature");
      return new Response('Unauthorized', { status: 400 });
    }

    // 3. Parse data only AFTER verification
    const payload = JSON.parse(rawBody);
    
    // 3. Handle specific event
    if (payload.event !== 'payment.captured') {
      return new Response('Event ignored', { status: 200 });
    }

    // 4. Extract Booking ID (Checking both payment and order notes)
    const notes = payload.payload.payment.entity.notes || {};
    const bookingId = notes.booking_id;

    if (!bookingId) {
      console.error("No booking_id found in webhook notes:", notes);
      return new Response('No Booking ID', { status: 200 });
    }

    // 5. Google Auth Setup
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    // 6. Fetch the PENDING event
    const event = await calendar.events.get({ 
      calendarId: CALENDAR_ID, 
      eventId: bookingId 
    });

    const patientData = JSON.parse(event.data.description || '{}');
    const start = event.data.start?.dateTime;

    // 7. Update to CONFIRMED
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
        summary: `CONFIRMED: ${patientData.name || 'Patient'}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    // 8. Send Initial Confirmation
    if (start) {
      await sendConfirmation(patientData.email, patientData.phone, start);
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error("Razorpay Webhook Crash:", error.message);
    return new Response(`Error: ${error.message}`, { status: 500 });
  }
}

async function sendConfirmation(email: string, phone: string, time: string) {
  const timeStr = new Date(time).toLocaleString('en-IN', { 
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
  });
  const link = process.env.NEXT_PUBLIC_MEET_LINK;

  try {
    // Nodemailer
    const transporter = nodemailer.createTransport({ 
      service: 'gmail', 
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
    });
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: email,
      subject: "Appointment Confirmed - Dr. Dixit",
      html: `<b>Namaste</b>, your session is confirmed for ${timeStr}. <br>Link: ${link}`
    });

    // Twilio WhatsApp
    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await twilioClient.messages.create({
      body: `Confirmed! 🌿 Your appointment with Dr. Dixit is on ${timeStr}. Join: ${link}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${phone.toString().slice(-10)}`
    });
  } catch (e) {
    console.error("Failed to send initial notification");
  }
}