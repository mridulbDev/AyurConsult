import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    // Give Google a moment to settle the move
    await delay(1000);

    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 40000).toISOString(),
      singleEvents: true,
      orderBy: 'updated',
    });

    // Get the most recently updated Confirmed event
    const event = list.data.items?.reverse().find(ev => ev.summary?.includes('CONFIRMED'));
    
    if (!event || !event.description) return new Response('OK', { status: 200 });

    const patientData = JSON.parse(event.description);

    // 🛑 LOOP PROTECTION
    // If 'system' moved it, we already sent the email in the previous execution.
    // We just flip the flag back to 'doctor' and exit.
    if (patientData.lastUpdatedBy === 'system') {
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) 
        }
      });
      return new Response('Loop Blocked', { status: 200 });
    }

    // --- DOCTOR MANUAL MOVE LOGIC STARTS HERE ---

    // 1. CLEAR OVERLAPS (The "Box on Box" fix)
    const start = event.start?.dateTime;
    const end = event.end?.dateTime;

    if (start && end) {
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: start,
        timeMax: end,
        singleEvents: true,
      });

      for (const item of (overlaps.data.items || [])) {
        if (item.summary === 'Available' && item.id !== event.id) {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
        }
      }
    }

    // 2. SEND NOTIFICATIONS (Do this BEFORE patching the event)
    const timeStr = new Date(start!).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

    // Gmail - Full Template
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Rescheduled by Dr. Dixit`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee;">
            <h2>Namaste ${patientData.name},</h2>
            <p>Dr. Dixit has adjusted your consultation time.</p>
            <p style="font-size: 18px;"><b>New Time: ${timeStr}</b></p>
            <div style="margin: 20px 0;">
              <a href="${meetLink}" style="background: #123025; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px;">Join Video Call</a>
            </div>
            <p><b>Patient Details:</b><br/>
               Symptoms: ${patientData.symptoms || 'Not provided'}<br/>
               History: ${patientData.history || 'None'}</p>
            <hr/>
            <p style="font-size: 12px; color: #666;">You can reschedule this session one more time if needed: <a href="${reschedUrl}">${reschedUrl}</a></p>
          </div>`
      });
    } catch (e) { console.error("Email Error:", e); }

    // Twilio WhatsApp
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n\n📅 Time: ${timeStr}\n🔗 Join: ${meetLink}\n\nManage booking: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (e) { console.error("WhatsApp Error:", e); }

    // 3. UPDATE DATA (Reset flag + Mark as System so the next trigger is ignored)
    const updatedData = { 
      ...patientData, 
      rescheduled: false, // Reset so patient gets their 1-time move back
      lastUpdatedBy: 'system' 
    };

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: event.id!,
      requestBody: { description: JSON.stringify(updatedData) }
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response('Error', { status: 200 });
  }
}