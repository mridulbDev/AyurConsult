import { google } from 'googleapis';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';
import nodemailer from 'nodemailer';

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const getAuth = () => {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
};
console.log("Razorpay Webhook Initialized with Calendar ID:", CALENDAR_ID);

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    // 1. Security Check
    const isValid = validateWebhookSignature(body, signature, secret);
    if (!isValid) return new Response('Unauthorized', { status: 400 });

    const payload = JSON.parse(body);
    if (payload.event !== 'payment.captured') return new Response('OK', { status: 200 });

    // 2. Extract Booking ID
    const bookingId = payload.payload.payment.entity.notes?.booking_id
    console.log("Razorpay Webhook Received for Booking ID:", bookingId);
    if (!bookingId) return new Response('No Booking ID', { status: 200 });

    const calendar = google.calendar({ version: 'v3', auth: getAuth() });
    const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
    
    // 3. Parse Metadata (Stored in PENDING step)
    let storedData;
    try {
      storedData = JSON.parse(event.data.description || '{}');
    } catch (e) {
      return new Response('Invalid Event Metadata', { status: 200 });
    }

    const start = event.data.start?.dateTime;
    if (!start) return new Response('Event has no start time', { status: 200 });

    // 4. CONFIRM THE SLOT
    // Set lastUpdatedBy: 'SYSTEM' so calendar webhook ignores this update
    const finalDesc = JSON.stringify({
      ...storedData,
      rescheduled: false, // Fresh booking, allow 1 reschedule
      lastUpdatedBy: 'SYSTEM', 
      lastNotifiedTime: start // Sync notified time
    });

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${storedData.name}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    // 5. Send Email Notification
    const timeStr = new Date(start).toLocaleString('en-IN', { 
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
    });
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || '#';
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    const transporter = nodemailer.createTransport({ 
      service: 'gmail', 
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
    });

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2>Booking Confirmed</h2>
        <p>Namaste <strong>${storedData.name}</strong>,</p>
        <p>Your consultation is confirmed.</p>
        <div style="background: #e8f5e9; padding: 15px; border-radius: 4px; margin: 15px 0;">
          <p><strong>📅 Date & Time:</strong> ${timeStr}</p>
          <p><strong>🔗 Video Link:</strong> <a href="${meetLink}">${meetLink}</a></p>
        </div>
        <p style="font-size: 12px; color: #555;">
          If you need to reschedule, <a href="${rescheduleLink}">click here</a>.
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: storedData.email,
      subject: `Appointment Confirmed - ${timeStr}`,
      html: htmlContent
    });

    return new Response('OK', { status: 200 });

  } catch (error) {
    console.error("Razorpay Webhook Error:", error);
    return new Response('OK', { status: 200 }); 
  }
}