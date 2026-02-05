import { google, calendar_v3 } from 'googleapis';
import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();

export async function POST(req: Request) {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });

    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK', { status: 200 });

    // 1. Handle Sync Token properly (must be string or undefined, never null)
    const storedToken = await redis.get<string>('google_calendar_sync_token');
    const syncToken = storedToken ?? undefined;

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken: syncToken,
    });

    if (response.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const changes = response.data.items || [];
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
    });

    for (const event of changes) {
      // Basic validation
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) continue;

      let patientData;
      try {
        patientData = JSON.parse(event.description);
      } catch { continue; }

      const newStart = event.start?.dateTime;
      const newEnd = event.end?.dateTime;

      // Ensure we have a valid string for time comparison
      if (!newStart || !newEnd || patientData.lastNotifiedTime === newStart) continue;

      // 2. Cleanup Ghost Slots (Casting parameters to string to fix the "red line")
      try {
        const checkSlots = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: newStart as string,
          timeMax: newEnd as string,
          singleEvents: true,
        });

        const ghostSlot = checkSlots.data.items?.find(e => 
          e.summary === 'Available' && e.id !== event.id
        );

        if (ghostSlot?.id) {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghostSlot.id });
        }
      } catch (err) {
        console.error("Slot cleanup failed:", err);
      }

      // 3. Notification Logic
      const timeStr = new Date(newStart).toLocaleString('en-IN', { 
        dateStyle: 'medium', 
        timeStyle: 'short', 
        timeZone: 'Asia/Kolkata' 
      });
      
      const reschedUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;

      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Appointment Update - Dr. Dixit Ayurveda`,
        html: `
          <div style="font-family: sans-serif; color: #123025;">
            <p>Namaste ${patientData.name},</p>
            <p>The doctor has updated your appointment time to: <b>${timeStr}</b></p>
            <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}" style="background:#123025; color:white; padding:10px; text-decoration:none; border-radius:5px;">Join Video Call</a></p>
            <p style="font-size:12px; color:#666;">Need to change this? <a href="${reschedUrl}">Reschedule once here</a></p>
          </div>`
      });

      // 4. Update Event State
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id as string,
        requestBody: { 
          description: JSON.stringify({ 
            ...patientData, 
            lastNotifiedTime: newStart, 
            rescheduled: false, 
            lastUpdatedBy: 'doctor' 
          }) 
        }
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    if (error.code === 410) {
      await redis.del('google_calendar_sync_token');
      return new Response('Sync Token Expired - Resetting', { status: 200 });
    }
    console.error("Webhook Error:", error);
    return new Response('Internal Error', { status: 500 });
  }
}