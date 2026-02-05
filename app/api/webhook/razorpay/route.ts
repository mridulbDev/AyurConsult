import { google } from 'googleapis';
import {validateWebhookSignature} from 'razorpay/dist/utils/razorpay-utils';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;
    const isValid = validateWebhookSignature(body, signature, secret);
    if (!isValid) return new Response('Unauthorized', { status: 400 });

    const payload = JSON.parse(body);
    if (payload.event !== 'payment.captured') return new Response('OK', { status: 200 });

    // 1. Get the booking_id 
    const bookingId = payload.payload.payment.entity.notes?.booking_id;
    if (!bookingId) return new Response('No Booking ID found in payment notes', { status: 200 });

    console.log(`Razorpay Payment Captured for Booking ID: ${bookingId}`);
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    // 2. Fetch the PENDING event from Calendar
    const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
    
    // 3. PARSE THE PAYLOAD FROM DESCRIPTION
    // This contains the eventId, patientData, etc., that you saved during POST /api/consultation
    let storedData;
    try {
      storedData = JSON.parse(event.data.description || '{}');
    } catch (e) {
      console.error("Failed to parse event description JSON");
      return new Response('Invalid Event Metadata', { status: 200 });
    }

    const start = event.data.start?.dateTime;
    const patientEmail = storedData.email;
    const patientName = storedData.name;
    const patientPhone = storedData.phone;

    // 4. CONFIRM THE SLOT
    // We update lastUpdatedBy to SYSTEM_CONFIRM to trigger the "Reset Gatekeeper" in the calendar webhook
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
        summary: `CONFIRMED: ${patientName}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    // 5. NOTIFICATIONS
    const timeStr = new Date(start!).toLocaleString('en-IN', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
    });
    const rescheduleUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    // Email to Patient
    try {
      const transporter = nodemailer.createTransport({ 
        service: 'gmail', 
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientEmail,
        subject: `Booking Confirmed - Dr. Dixit Ayurveda`,
        html: `<div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 8px;">
                <h2>Namaste ${patientName},</h2>
                <p>Your session is confirmed for: <b style="color: #E8A856;">${timeStr}</b></p>
                <p><a href="${meetLink}" style="background: #123025; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Video Call</a></p>
                <p style="margin-top: 20px; font-size: 12px;">Need to reschedule? <a href="${rescheduleUrl}">Click here</a></p>
              </div>`
      });
    } catch (err) { console.error("Mail Error:", err); }

    // WhatsApp to Patient
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const cleanPhone = patientPhone.toString().replace(/\D/g, '').slice(-10);
      await twilioClient.messages.create({
        body: `Namaste ${patientName}, booking confirmed! 🌿\n\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}\n🔄 Reschedule: ${rescheduleUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${cleanPhone}`
      });
    } catch (err) { console.error("WhatsApp Error:", err); }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Razorpay Webhook Critical Error:", error);
    return new Response('OK', { status: 200 }); 
  }
}