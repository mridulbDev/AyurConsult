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
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    const resourceState = req.headers.get('x-goog-resource-state');
    if (resourceState === 'sync') return new Response('OK', { status: 200 });

    // 1. Get events updated in the last 20 seconds
    const list = await calendar.events.list({
      calendarId: CALENDAR_ID,
      updatedMin: new Date(Date.now() - 20000).toISOString(),
      singleEvents: true,
      orderBy: 'updated',
    });

    // Find the confirmed event that was just moved
    const event = list.data.items?.reverse().find(ev => ev.summary?.includes('CONFIRMED'));
    
    if (!event || !event.description) {
      return new Response('No confirmed event found', { status: 200 });
    }

    let patientData;
    try {
      patientData = JSON.parse(event.description);
    } catch (e) {
      return new Response('Description not JSON', { status: 200 });
    }

    // 🛑 CRITICAL: STOP THE INFINITE LOOP
    // If the system just updated this event, stop here so we don't notify/overlap again.
    if (patientData.lastUpdatedBy === 'system') {
      console.log("System update detected, skipping webhook logic to prevent loop.");
      // Flip the flag to 'doctor' for the NEXT manual move
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { 
          description: JSON.stringify({ ...patientData, lastUpdatedBy: 'doctor' }) 
        }
      });
      return new Response('OK', { status: 200 });
    }

    // --- DOCTOR MANUAL MOVE DETECTED ---

    // 2. CLEANUP OVERLAPS (Delete "Available" slots at the new location)
    // We expand the window by 1 minute to ensure we catch the slot
    const startSearch = new Date(new Date(event.start?.dateTime!).getTime() + 1000).toISOString();
    const endSearch = new Date(new Date(event.end?.dateTime!).getTime() - 1000).toISOString();

    const overlaps = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startSearch,
      timeMax: endSearch,
      singleEvents: true,
    });

    for (const item of (overlaps.data.items || [])) {
      if (item.summary === 'Available' && item.id !== event.id) {
        console.log("Deleting overlapping available slot:", item.id);
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: item.id! });
      }
    }

    // 3. UPDATE DATA (Reset flag + Mark as System)
    const reschedUrl = `${baseUrl}/consultation?reschedule=${event.id}`;
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

    // 4. NOTIFY PATIENT
    const timeStr = new Date(event.start?.dateTime!).toLocaleString('en-IN', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });

    // Email
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
      });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Update - Dr. Dixit Ayurveda`,
        html: `<div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
                <h3 style="color: #123025;">Namaste ${patientData.name},</h3>
                <p>Your consultation has been rescheduled by the doctor.</p>
                <p><b>New Time:</b> ${timeStr}</p>
                <p><a href="${meetLink}" style="background: #123025; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Join Video Call</a></p>
                <hr />
                <p style="font-size: 12px; color: #666;">Need to change this? Use your <a href="${reschedUrl}">Reschedule Link</a></p>
               </div>`
      });
    } catch (err) { console.error("Email error:", err); }

    // WhatsApp
    try {
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Namaste ${patientData.name}, Dr. Dixit has rescheduled your session.\n\n📅 New Time: ${timeStr}\n🔗 Link: ${meetLink}\n\nYou can move this once here: ${reschedUrl}`,
        from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
        to: `whatsapp:+91${patientData.phone.toString().slice(-10)}`
      });
    } catch (err) { console.error("Twilio error:", err); }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", error);
    return new Response('OK', { status: 200 }); // Always 200 to Google
  }
}