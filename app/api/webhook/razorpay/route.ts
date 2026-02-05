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
    const data = JSON.parse(body);
    const payment = data.payload.payment.entity;
    console.log(data);
const bookingId = payment.notes?.booking_id;

    console.log("Razor Pay Processing Booking ID:", bookingId);
    if (signature !== expectedSignature) return new Response('Unauthorized', { status: 400 });
    console.log("Razorpay Signature Verified");

    console.log("Event Type:", data.entity);
    if (data.event !== 'payment.captured' ) return new Response('OK');

    
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
     console.log(patientData.email, patientData.name,start);
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK!;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    //Prepare Links
    const reschedUrl = `${baseUrl}/consultation?reschedule=${bookingId}`;
    console.log("Preparing Confirmation Email for Booking ID:", bookingId);
    const finalDesc = JSON.stringify({
      ...patientData,
      rescheduled: false,
      lastUpdatedBy: 'system',
      lastNotifiedTime: start // Syncing this prevents the Webhook from double-mailing
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
    console.log("Calendar Event Updated, Sending Confirmation Email...");

    const timeStr = new Date(start!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: patientData.email,
      subject: `Consultation Confirmed - ${patientData.name}`,
      html: `
        <div style="font-family: sans-serif; color: #123025; max-width: 600px;">
          <h2>Namaste ${patientData.name},</h2>
          <p>Your Ayurvedic consultation has been successfully booked.</p>
          
          <div style="background: #f4f4f4; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Date & Time:</strong> ${timeStr}</p>
            <p><strong>Platform:</strong> Google Meet</p>
          </div>

          <p>
            <a href="${meetLink}" style="display: inline-block; background: #123025; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Join Meeting
            </a>
          </p>

          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          
          <p style="font-size: 13px; color: #666;">
            Need to change your time? You can reschedule your appointment once using the link below:
            <br />
            <a href="${reschedUrl}">${reschedUrl}</a>
          </p>
        </div>
      ` 
    });

    return new Response('OK');
  } catch (error) { return new Response('Error', { status: 500 }); }
}