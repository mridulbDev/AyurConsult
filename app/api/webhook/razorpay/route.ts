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
    
    if (signature !== expectedSignature) {
      return new Response(JSON.stringify({ error: 'Invalid Signature' }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const data = JSON.parse(body);
    if (data.event !== 'payment.captured') return new Response('OK', { status: 200 });

    const payment = data.payload.payment.entity;
    const bookingId = payment.notes?.booking_id; 
    if (!bookingId) return new Response('No Booking ID', { status: 200 });

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const eventRes = await calendar.events.get({ 
      calendarId: process.env.GOOGLE_CALENDAR_ID, 
      eventId: bookingId 
    });

    // Fetch the start and end times from the Google Event
const start = eventRes.data.start?.dateTime;
const end = eventRes.data.end?.dateTime;

const timeOptions: Intl.DateTimeFormatOptions = { 
  hour: '2-digit', 
  minute: '2-digit', 
  hour12: true,
  timeZone: 'Asia/Kolkata' 
};

const dateOptions: Intl.DateTimeFormatOptions = {
  day: 'numeric', 
  month: 'short',
  timeZone: 'Asia/Kolkata'
};

// Format: "5 Feb, 10:30 AM - 11:00 AM"
const appointmentTime = start && end
  ? `${new Date(start).toLocaleString('en-IN', dateOptions)}, ${new Date(start).toLocaleTimeString('en-IN', timeOptions)} - ${new Date(end).toLocaleTimeString('en-IN', timeOptions)}`
  : "Scheduled Time";

    const patientData = JSON.parse(eventRes.data.description || '{}');
    
    // We define these once here so they are available everywhere below
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "https://meet.google.com/kzq-tfhm-wjp";
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    // 1. PATCH GOOGLE CALENDAR
    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: meetLink,
        description: `
PATIENT: ${patientData.name}
PHONE: ${patientData.phone}
SYMPTOMS: ${patientData.symptoms}
HISTORY: ${patientData.history}
AGE: ${patientData.age}

MEETING LINK: ${meetLink}
        `.trim(),
      }
    });

    console.log("🚀 Starting Notifications for:", patientData.email);

    // 2. SEND NOTIFICATIONS
    try {
      // WhatsApp Notification
      if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;

        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, session confirmed! \nMeeting: ${meetLink} \nReschedule: ${rescheduleLink}  \n📅 *Time:* ${appointmentTime}\n`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone
        });
        console.log("✅ Twilio Sent Successfully");
      }

      // Email Notification
      if (process.env.EMAIL_PASS && process.env.DOCTOR_EMAIL) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { 
            user: process.env.DOCTOR_EMAIL, 
            pass: process.env.EMAIL_PASS 
          }
        });

        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Booking Confirmed - ${patientData.name}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #123025;">
              <h2>Consultation Confirmed</h2>
              <p>Namaste ${patientData.name},</p>
              <p>Your session is booked. Please join using the link below:</p>
              <p><a href="${meetLink}" style="background: #E8A856; color: #123025; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">/nJoin Video Call \n📅 *Time:* ${appointmentTime}\n</a></p>
              <hr />
              <p style="font-size: 12px;">Need to change time? <a href="${rescheduleLink}">Reschedule here </a></p>
            </div>
          `
        });
        console.log("✅ Email Sent Successfully");
      }
    } catch (notifErr: any) {
      console.error("❌ NOTIFICATION BLOCK FAILED:", notifErr.message);
    }

    return new Response('OK', { status: 200 });

  } catch (error: any) {
    console.error("WEBHOOK ERROR:", error); 
    return new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
  }
}