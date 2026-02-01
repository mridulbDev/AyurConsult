import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';
import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const isValid = validateWebhookSignature(body, signature!, process.env.RAZORPAY_WEBHOOK_SECRET!);

  if (!isValid) return new Response('Invalid Signature', { status: 400 });

  const  payload  = JSON.parse(body);
  const payment = payload.payload.payment.entity;
  const bookingId = payment.notes.booking_id; 

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const calendar = google.calendar({ version: 'v3', auth });

  const event = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: bookingId });

  if (event) {
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
    
    // --- BUILD RESCHEDULE LINK SAFELY ---
    const reschedParams = new URLSearchParams();
    reschedParams.append('reschedule', bookingId);
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?${reschedParams.toString()}`;

    // 1. Send WhatsApp via Twilio
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, session confirmed! Link: ${meetLink}. Reschedule here: ${rescheduleLink}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${patientData.phone}`
      });
    } catch (e) { console.error("Twilio failed", e); }

    // 2. Send Email via Nodemailer
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.DOCTOR_EMAIL, 
          pass: process.env.EMAIL_PASS, 
        },
      });

      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.EMAIL_USER}>`,
        to: patientData.email,
        subject: `Booking Confirmed - ${patientData.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2>Namaste ${patientData.name},</h2>
            <p>Your Consultation with Dr. Dixit is confirmed.</p>
            <p><strong>Meeting Link:</strong> <a href="${meetLink}">${meetLink}</a></p>
            <p><strong>Reschedule Link:</strong> <a href="${rescheduleLink}">Change Date/Time</a></p>
            <br />
            <p>Warm regards,<br />Dr. Dixit Ayurveda</p>
          </div>
        `
      });
    } catch (e) { console.error("Email failed", e); }
  }

  return new Response('OK', { status: 200 });
}