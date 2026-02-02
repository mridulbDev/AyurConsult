import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET!;

    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    
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

    // Fetch the specific event to get time and description
    const eventRes = await calendar.events.get({ 
      calendarId: process.env.GOOGLE_CALENDAR_ID, 
      eventId: bookingId 
    });

    const patientData = JSON.parse(eventRes.data.description || '{}');
    
    // --- FORMAT TIME & LINKS ---
    const startTime = eventRes.data.start?.dateTime;
    const appointmentTime = startTime 
      ? new Date(startTime).toLocaleString('en-IN', { 
          day: 'numeric', 
          month: 'short', 
          hour: '2-digit', 
          minute: '2-digit', 
          hour12: true 
        }) 
      : "Scheduled Time";

    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "https://meet.google.com/kzq-tfhm-wjp";
    const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;
    const drPhone = process.env.DOCTOR_PHONE || "+918306623303"; 

    // 1. PATCH GOOGLE CALENDAR (Update status to Confirmed)
    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: meetLink,
        description: `PATIENT: ${patientData.name}\nPHONE: ${patientData.phone}\nSYMPTOMS: ${patientData.symptoms}\nHISTORY: ${patientData.history}\nAGE: ${patientData.age}\n\nMEETING LINK: ${meetLink}`.trim(),
      }
    });

    console.log("🚀 Starting Notifications...");

    // 2. SEND NOTIFICATIONS
    try {
      if (process.env.TWILIO_SID && process.env.TWILIO_TOKEN) {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;
        const senderWhatsApp = `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER}`;

        // A. SMS to Patient
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, session confirmed for ${appointmentTime}! Join: ${meetLink}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: formattedPhone
        });

        // B. WhatsApp to Patient
        await twilioClient.messages.create({
          body: `Namaste *${patientData.name}*, your Ayurvedic Consultation is confirmed.\n\n📅 *Time*: ${appointmentTime}\n🔗 *Join Link*: ${meetLink}\n\nTo reschedule: ${rescheduleLink}`,
          from: senderWhatsApp,
          to: `whatsapp:${formattedPhone}`
        });

        // C. WhatsApp to Dr. Dixit (YOU)
        await twilioClient.messages.create({
          body: `🔔 *NEW BOOKING*\n\n👤 *Patient*: ${patientData.name}\n📅 *Time*: ${appointmentTime}\n🎂 *Age*: ${patientData.age}\n📝 *Symptoms*: ${patientData.symptoms}\n\n🔗 *Meet Link*: ${meetLink}`,
          from: senderWhatsApp,
          to: `whatsapp:${drPhone}`
        });
        
        console.log("✅ Twilio (SMS & WhatsApp) Dispatched");
      }

      // 3. EMAIL NOTIFICATIONS
      if (process.env.EMAIL_PASS && process.env.DOCTOR_EMAIL) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
        });

        // Email to Patient
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
          to: patientData.email,
          subject: `Consultation Confirmed - ${appointmentTime}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee;">
              <h2 style="color: #123025;">Booking Confirmed</h2>
              <p>Namaste <strong>${patientData.name}</strong>,</p>
              <p>Your session is scheduled for: <strong>${appointmentTime}</strong></p>
              <p><a href="${meetLink}" style="background: #E8A856; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Video Session</a></p>
              <hr />
              <p style="font-size: 11px;">Need to reschedule? <a href="${rescheduleLink}">Click here</a></p>
            </div>
          `
        });

        // Email to Doctor (Internal Copy)
        await transporter.sendMail({
          from: `"Booking System" <${process.env.DOCTOR_EMAIL}>`,
          to: process.env.DOCTOR_EMAIL,
          subject: `New Patient: ${patientData.name}`,
          html: `<h3>New Appointment</h3><p><strong>Time:</strong> ${appointmentTime}</p><p><strong>Symptoms:</strong> ${patientData.symptoms}</p>`
        });

        console.log("✅ Emails Sent Successfully");
      }
    } catch (notifErr: any) {
      console.error("❌ NOTIFICATION BLOCK ERROR:", notifErr.message);
    }

    return new Response('OK', { status: 200 });

  } catch (error: any) {
    console.error("WEBHOOK ERROR:", error); 
    return new Response(JSON.stringify({ error: 'Internal Error' }), { status: 500 });
  }
}