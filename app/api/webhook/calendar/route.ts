import { google, calendar_v3 } from 'googleapis';
import { Redis } from '@upstash/redis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();

// 1. Properly typed Auth
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

// 2. Pass auth directly into the calendar configuration
const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

export async function POST(req: Request) {
  try {
    const syncToken = await redis.get<string>('google_calendar_sync_token');
    
    // Fix: Cast params to any if TS struggles with the union type of syncToken
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      syncToken: syncToken || undefined,
    } as any);

    if (response.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const events = response.data.items || [];

    for (const event of events) {
      // Handle deleted events (status 'cancelled') which appear in sync streams
      if (event.status === 'cancelled' || !event.description || !event.summary?.includes('CONFIRMED')) {
        continue;
      }

      let data;
      try { 
        data = JSON.parse(event.description); 
      } catch { 
        continue; 
      }

      const currentStart = event.start?.dateTime;

      // 🛑 LOOP & REDUNDANCY PREVENTION
      if (data.lastNotifiedTime === currentStart) continue;

      // 1. Clean up the ghost "Available" slot
      if (currentStart && event.end?.dateTime) {
        const listDest = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: currentStart,
          timeMax: event.end.dateTime,
          singleEvents: true
        });

        const ghost = listDest.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
        if (ghost?.id) {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id });
        }
      }

      // 2. Update Metadata FIRST (Atomic-like behavior)
      const updatedData = { 
        ...data, 
        lastNotifiedTime: currentStart, 
        lastUpdatedBy: 'DOCTOR' 
      };
      
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: JSON.stringify(updatedData) }
      });

      // 3. Notify Patient
      if (currentStart) {
        await sendMoveNotification(data.email, data.phone, currentStart);
      }
    }
    
    return new Response('OK', { status: 200 });
  } catch (error: any) {
    // 410 means sync token is expired, must clear and re-sync
    if (error.code === 410) {
      await redis.del('google_calendar_sync_token');
    }
    console.error("Webhook Error:", error);
    return new Response('Internal Error', { status: 200 }); // Always return 200 to Google to stop retries
  }
}

async function sendMoveNotification(email: string, phone: string, time: string) {
  const timeStr = new Date(time).toLocaleString('en-IN', { 
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
  });
  const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

  try {
    // Email
    const transporter = nodemailer.createTransport({ 
      service: 'gmail', 
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
    });
    
    await transporter.sendMail({
      from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
      to: email,
      subject: `Schedule Update - Dr. Dixit`,
      html: `<p>Namaste, your appointment has been moved to: <b>${timeStr}</b>. <br>Join Link: ${meetLink}</p>`
    });

    // WhatsApp
    const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
    await twilioClient.messages.create({
      body: `Namaste! Your appointment is moved to: 📅 ${timeStr}. Link: ${meetLink}`,
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: `whatsapp:+91${phone.toString().slice(-10)}`
    });
  } catch (err) {
    console.error("Notification delivery failed", err);
  }
}