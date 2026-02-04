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
    if (!bookingId) return new Response('No Booking ID', { status: 200 });

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const eventRes = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: bookingId });
    const start = eventRes.data.start?.dateTime;
    const patientData = JSON.parse(eventRes.data.description || '{}');
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "";
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    // Mark description with specific signature to avoid calendar webhook loop
    const descriptionData = JSON.stringify({
      ...patientData,
      rescheduled: false,
      lastUpdatedBy: 'system_webhook',
      lastNotifiedTime: start
    });

    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: meetLink,
        description: descriptionData
      }
    });

    const timeStr = new Date(start!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

    // Single Notification Logic
    try {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda"`,
        to: patientData.email,
        subject: `Consultation Confirmed - ${patientData.name}`,
        html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2>Booking Confirmed</h2>
                <p>Namaste ${patientData.name}, scheduled for: <b>${timeStr}</b></p>
                <p><a href="${meetLink}">Join Video Call</a></p>
                <p>Need to change time? <a href="${rescheduleLink}">Reschedule here</a></p>
              </div>`
      });

      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
      const formattedPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, booking confirmed!\n📅 Time: ${timeStr}\n🔗 Meeting: ${meetLink}\n🔄 Reschedule: ${rescheduleLink}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${formattedPhone}`
      });
    } catch (e) { console.error("Notification error:", e); }

    return new Response('OK', { status: 200 });
  } catch (error) { return new Response('Internal Error', { status: 500 }); }
}