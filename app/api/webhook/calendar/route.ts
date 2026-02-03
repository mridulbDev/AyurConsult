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

    // 1. Wait for Google to process the move
    await delay(2000);

    // 2. Fetch events updated very recently
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 60000).toISOString(),
      singleEvents: true,
      orderBy: 'updated',
    });

    // Find the confirmed event that was moved
    const event = list.data.items?.reverse().find(ev => ev.summary?.includes('CONFIRMED'));
    
    if (!event || !event.description || !event.start?.dateTime) {
      console.log("No valid confirmed event found in recent updates.");
      return new Response('OK', { status: 200 });
    }

    const patientData = JSON.parse(event.description);

    // 🛑 STOP LOOP
    // If the last update was by 'system', we don't send emails again.
    if (patientData.lastUpdatedBy === 'system') {
      console.log("System update detected. Skipping email to prevent loops.");
      // We flip it back to 'doctor' so the NEXT time the doctor moves it, it triggers.
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) }
      });
      return new Response('OK', { status: 200 });
    }

    // --- DOCTOR MANUAL MOVE LOGIC ---

    const start = event.start.dateTime;
    const end = event.end?.dateTime;

    // 3. AGGRESSIVE OVERLAP CLEANUP
    // We fetch all events for that specific day to ensure we find the "Available" ghost
    const dayStart = new Date(start);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(start);
    dayEnd.setHours(23, 59, 59, 999);

    const dayEvents = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
    });

    for (const item of (dayEvents.data.items || [])) {
      // If an Available slot exists at the EXACT same start time as our Confirmed event
      if (item.summary === 'Available' && item.start?.dateTime === start && item.id !== event.id) {
        console.log("Deleting overlapping available slot:", item.id);
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
      }
    }

    // 4. SEND NOTIFICATIONS
    const timeStr = new Date(start).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
    const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;

    // Email Logic
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });

      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Rescheduled - Dr. Dixit Ayurveda`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #123025;">Namaste ${patientData.name},</h2>
            <p>Your appointment has been rescheduled by Dr. Dixit.</p>
            <p style="font-size: 18px; background: #f9f9f9; padding: 10px; display: inline-block;">
              <b>New Time: ${timeStr}</b>
            </p>
            <div style="margin: 20px 0;">
              <a href="${meetLink}" style="background: #123025; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Join Video Call</a>
            </div>
            <p><b>Details:</b><br/>
            Symptoms: ${patientData.symptoms || 'None'}<br/>
            Medical History: ${patientData.history || 'None'}</p>
            <hr style="border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #666;">Need to move this? Use your link: <a href="${reschedUrl}">${reschedUrl}</a></p>
          </div>`
      });
      console.log("Email sent to", patientData.email);
    } catch (e) {
      console.error("Failed to send email:", e);
    }

    // WhatsApp Logic
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n\n📅 New Time: ${timeStr}\n🔗 Join: ${meetLink}\n🔗 Manage: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
      console.log("WhatsApp message sent.");
    } catch (e) {
      console.error("Failed to send WhatsApp:", e);
    }

    // 5. FINAL PATCH (Update description to 'system' to prevent repeat trigger)
    const updatedData = { 
      ...patientData, 
      rescheduled: false, // Resetting so patient can move it once more
      lastUpdatedBy: 'system' 
    };

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: event.id!,
      requestBody: { description: JSON.stringify(updatedData) }
    });

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Critical Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}