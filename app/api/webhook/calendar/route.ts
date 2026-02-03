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
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    // Fetch events updated in the last 60 seconds
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 60000).toISOString(),
      singleEvents: true,
      orderBy: 'updated'
    });

    const event = list.data.items?.find(ev => ev.summary?.startsWith('CONFIRMED'));

    if (event && event.description) {
      let patientData;
      try {
        // Parse the JSON string from the description
        patientData = JSON.parse(event.description);
      } catch (e) {
        console.error("Not a JSON description, skipping...");
        return new Response('Not a managed event', { status: 200 });
      }

      // 1. UPDATE THE "RESCHEDULED" FLAG
      // If the Doctor moves it, we reset the flag to 'false' so the 
      // patient gets their one-time reschedule right back.
      if (patientData.rescheduled === true) {
        patientData.rescheduled = false;
        
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId: event.id!,
          requestBody: {
            description: JSON.stringify(patientData)
          }
        });
        console.log("🚩 Reschedule flag reset for patient");
      }

      const patientName = patientData.name || "Patient";
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

      // 2. WHATSAPP NOTIFICATION
      if (patientData.phone && process.env.TWILIO_SID) {
        try {
          const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
          const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
          const formattedPhone = `whatsapp:+91${cleanPhone.slice(-10)}`;

          await twilioClient.messages.create({
            body: `Namaste ${patientName}, Dr. Dixit has updated your session time.\n\n📅 *New Time:* ${newTimeRange}\n🔗 *Meeting Link:* ${meetLink}`,
            from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
            to: formattedPhone
          });
          console.log(`✅ WhatsApp Sent to ${formattedPhone}`);
        } catch (e) { console.error("Twilio Error:", e); }
      }

      // 3. EMAIL NOTIFICATION
      if (patientData.email && process.env.EMAIL_PASS) {
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
          });

          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientData.email,
            subject: `Updated Time: Consultation with Dr. Dixit`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #123025;">Session Time Updated</h2>
                <p>Namaste <strong>${patientName}</strong>,</p>
                <p>Dr. Dixit has adjusted your appointment time:</p>
                <p style="font-size: 18px; font-weight: bold; color: #E8A856; margin: 20px 0;">${newTimeRange}</p>
                <p>Please join the session using the same link as before:</p>
                <p><a href="${meetLink}" style="background: #123025; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Join Video Call</a></p>
              </div>
            `
          });
          console.log(`✅ Email Sent to ${patientData.email}`);
        } catch (e) { console.error("Email Error:", e); }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error("WEBHOOK ERROR:", error);
    return new Response('Internal Error', { status: 500 });
  }
}