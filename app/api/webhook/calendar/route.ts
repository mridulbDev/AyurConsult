import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

export async function POST(req: Request) {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    // Fetch events changed in the last 60 seconds
    const list = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      updatedMin: new Date(Date.now() - 60000).toISOString(),
      singleEvents: true,
      orderBy: 'updated'
    });

    // Find the most recently updated "CONFIRMED" event
    const event = list.data.items?.find(ev => ev.summary?.startsWith('CONFIRMED'));

    if (event && event.description) {
      // 1. IMPROVED EXTRACTION (Case-insensitive regex)
      const phoneMatch = event.description.match(/PHONE:\s*(\d+)/i);
      const emailMatch = event.description.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/i);
      
      const patientName = event.summary?.replace('CONFIRMED: ', '') || "Patient";

      // 2. FORMAT NEW TIME RANGE
      const start = event.start?.dateTime;
      const end = event.end?.dateTime;
      
      const timeOptions: Intl.DateTimeFormatOptions = { 
        hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      };
      const dateOptions: Intl.DateTimeFormatOptions = { 
        day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' 
      };

      const newTimeRange = start && end
        ? `${new Date(start).toLocaleString('en-IN', dateOptions)}, ${new Date(start).toLocaleTimeString('en-IN', timeOptions)} - ${new Date(end).toLocaleTimeString('en-IN', timeOptions)}`
        : "New Scheduled Time";

      // 3. WHATSAPP & SMS NOTIFICATION
      if (phoneMatch && process.env.TWILIO_SID) {
        const patientPhone = phoneMatch[1];
        const formattedPhone = patientPhone.startsWith('91') ? `+${patientPhone}` : `+91${patientPhone}`;
        
        try {
          const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
          
          // Send WhatsApp
          await twilioClient.messages.create({
            body: `Namaste ${patientName}, Dr. Dixit has rescheduled your session.\n\n📅 *New Time:* ${newTimeRange}\n🔗 *Link:* ${meetLink}`,
            from: process.env.TWILIO_PHONE_NUMBER!,
            to: formattedPhone
          });
          
          console.log(`✅ WhatsApp Reschedule Sent to ${formattedPhone}`);
        } catch (e) { console.error("Twilio Reschedule Error:", e); }
      }

      // 4. EMAIL NOTIFICATION (Newly Added)
      if (emailMatch && process.env.EMAIL_PASS) {
        const patientEmail = emailMatch[0];
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
          });

          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientEmail,
            subject: `Rescheduled: Consultation with Dr. Dixit`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #123025;">Session Rescheduled</h2>
                <p>Namaste <strong>${patientName}</strong>,</p>
                <p>Dr. Dixit has moved your Ayurvedic consultation to a new time:</p>
                <p style="font-size: 18px; font-weight: bold; color: #E8A856;">${newTimeRange}</p>
                <p>The meeting link remains the same:</p>
                <p><a href="${meetLink}" style="background: #123025; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Meeting</a></p>
              </div>
            `
          });
          console.log(`✅ Email Reschedule Sent to ${patientEmail}`);
        } catch (e) { console.error("Nodemailer Reschedule Error:", e); }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error("WEBHOOK ERROR:", error);
    return new Response('Internal Error', { status: 500 });
  }
}