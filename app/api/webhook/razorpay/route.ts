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

    const payment = data.payload.payment.entity;
    const bookingId = payment.notes?.booking_id; 
    if (!bookingId) return new Response('No Booking ID', { status: 200 });

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
      // ADD THIS: If using Google Workspace, the service account must impersonate the doctor
      // subject: process.env.DOCTOR_EMAIL 
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // 1. Get current event
    const eventRes = await calendar.events.get({ 
      calendarId: process.env.GOOGLE_CALENDAR_ID, 
      eventId: bookingId 
    });

    const patientData = JSON.parse(eventRes.data.description || '{}');
    
    // 2. The Patch: Simplified and more robust
    const update = await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      conferenceDataVersion: 1, 
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        description: `Phone: ${patientData.phone}\nSymptoms: ${patientData.symptoms}\nHistory: ${patientData.history}\nAge: ${patientData.age}`,
        // Using a cleaner conferenceData structure
        conferenceData: {
          createRequest: {
            requestId: `req-${bookingId}-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutMeet' }
          }
        }
      }
    });

    // 3. Fallback: If hangoutLink is missing, Google didn't generate one
    const meetLink = update.data.hangoutLink || "Link will be sent shortly";
    
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    // Notifications
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, session confirmed! \nMeeting: ${meetLink} \nReschedule: ${rescheduleLink}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${patientData.phone}`
      });

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Booking Confirmed - ${patientData.name}`,
        html: `<p>Meeting Link: <a href="${meetLink}">${meetLink}</a></p>
        <p><strong>Reschedule Link:</strong> <a href="${rescheduleLink}">Change Date/Time</a></p>`
      });
    } catch (e) { console.error("Notification Error:", e); }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    // Detailed Logging: This will show EXACTLY what Google is complaining about
    console.error("GOOGLE API ERROR DATA:", error.response?.data); 
    console.error("Webhook Logic Error:", error.message);
    return new Response('Internal Error', { status: 500 });
  }
}