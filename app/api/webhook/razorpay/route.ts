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

    // 1. FORMAT APPOINTMENT TIME
    const start = eventRes.data.start?.dateTime;
    const end = eventRes.data.end?.dateTime;

    const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
    const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' };

    const appointmentTime = start && end
      ? `${new Date(start).toLocaleString('en-IN', dateOptions)}, ${new Date(start).toLocaleTimeString('en-IN', timeOptions)} - ${new Date(end).toLocaleTimeString('en-IN', timeOptions)}`
      : "Scheduled Time";

    // 2. PARSE AND SYNC DATA
    const patientData = JSON.parse(eventRes.data.description || '{}');
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "https://meet.google.com/kzq-tfhm-wjp";
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;

    const descriptionData = JSON.stringify({
      name: patientData.name,
      phone: patientData.phone,
      email: patientData.email,
      symptoms: patientData.symptoms,
      history: patientData.history || "",
      age: patientData.age || "",
      rescheduled: false,
      lastUpdatedBy: 'system'
    });

    // 3. UPDATE GOOGLE CALENDAR
    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: meetLink,
        description: descriptionData
      }
    });

    // 4. SEND NOTIFICATIONS
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      const drPhone = process.env.DOCTOR_PHONE!;
      const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
      const formattedPatientPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;

      // --- EMAIL TO PATIENT ---
      if (process.env.EMAIL_PASS && process.env.DOCTOR_EMAIL) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });

        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Consultation Confirmed - ${patientData.name}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 8px;">
              <h2 style="color: #123025;">Booking Confirmed</h2>
              <p>Namaste <strong>${patientData.name}</strong>,</p>
              <p>Your session is scheduled for: <span style="color: #E8A856; font-weight: bold;">${appointmentTime}</span></p>
              <p>Please use the link below to join at the scheduled time:</p>
              <p><a href="${meetLink}" style="background: #123025; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Join Video Call</a></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #666;">Need to change your time? <a href="${rescheduleLink}">Reschedule here</a></p>
            </div>
          `
        });
      }
      console.log("✅ All Notifications Sent Successfully");

      // --- WHATSAPP TO PATIENT ---
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, booking confirmed!\n\n📅 *Time:* ${appointmentTime}\n🔗 *Meeting Link:* ${meetLink}\n🔄 *Reschedule:* ${rescheduleLink}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${formattedPatientPhone}`
      });

      // --- WHATSAPP TO DOCTOR (DR. DIXIT) ---
      await twilioClient.messages.create({
        body: `🔔 *New Booking Confirmed*\n\n👤 *Patient:* ${patientData.name}\n📅 *Time:* ${appointmentTime}\n📝 *Symptoms:* ${patientData.symptoms}\n🔗 *Join Meeting:* ${meetLink}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:${drPhone.startsWith('+') ? drPhone : '+91' + drPhone}`
      });

      

    } catch (notifErr: any) {
      console.error("❌ NOTIFICATION ERROR:", notifErr.message);
    }

    return new Response('OK', { status: 200 });

  } catch (error: any) {
    console.error("WEBHOOK ERROR:", error);
    return new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
  }
}