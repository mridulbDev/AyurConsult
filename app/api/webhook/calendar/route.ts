import { google } from 'googleapis';
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

    if (req.headers.get('x-goog-resource-state') === 'sync') return new Response('OK');
    if (req.headers.get('x-goog-resource-state') === 'not_exists') return new Response('OK');

    const syncToken = await redis.get<string>('google_calendar_sync_token');
    const response = await calendar.events.list({ 
      calendarId: CALENDAR_ID, 
      syncToken: syncToken ?? undefined 
    });
    console.log("Google Calendar Webhook Hit - Processing Changes...");

    if (response.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const changes = response.data.items || [];
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const lastCleanup = await redis.get(`last_cleanup_${todayStr}`);

    if (!lastCleanup) {
      console.log("Running Daily Sweep: Cleaning up past Available slots...");
      const pastSlots = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
        timeMax: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        singleEvents: true,
      });

      for (const slot of (pastSlots.data.items || [])) {
        if (slot.summary === 'Available' ) {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
        }
      }
      // Mark as done for today so we don't repeat this for every single webhook hit
      await redis.set(`last_cleanup_${todayStr}`, 'done', { ex: 86400 }); 
    }
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
    });

    for (const event of changes) {
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description || event.summary?.startsWith('PENDING')){console.log("Processing Event:", event.summary);continue; }
      
      let patientData;
  try { patientData = JSON.parse(event.description || '{}'); } catch { continue; }

  const currentStart = event.start?.dateTime;
  if (!currentStart) {console.log("Invalid start time for event:", event.summary); continue; }
 
    if (patientData.lastUpdatedBy === "system" || patientData.lastUpdatedBy === "user" || patientData.lastNotifiedTime === currentStart ) {
        console.log("Skipping: Time hasn't changed and last update was non-doctor.");
        continue;
    }
  
  // If we reached here, it MUST be a manual Doctor drag/drop.
  
  // 1. Cleanup destination
  const overlaps = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: currentStart,
    timeMax: event.end?.dateTime!,
    singleEvents: true
  });
  // Use .filter() to get EVERY available slot in that range
const ghosts = overlaps.data.items?.filter(e => 
  e.summary === 'Available' && e.id !== event.id
) || [];

// Delete them all one by one
for (const ghost of ghosts) {
  if (ghost.id) {
    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id });
  }
}
  // 2. Patch the event (Updates time, resets reschedule credit to false, tags as 'doctor')
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId: event.id!,
    requestBody: {
      description: JSON.stringify({ 
        ...patientData, 
        lastNotifiedTime: currentStart, 
        rescheduled: false, 
        lastUpdatedBy: 'doctor' 
      })
    }
  });

  // 3. Email the patient
  const timeStr = new Date(currentStart).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const reschedUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;
  
  await transporter.sendMail({
    from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
    to: patientData.email,
    subject: `Appointment Update - Dr. Dixit Ayurveda`,
    html: `<p>Namaste ${patientData.name}, the doctor moved your session to: <b>${timeStr}</b></p>
           <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting</a> | <a href="${reschedUrl}">Reschedule Link</a></p>`
  });
    }
    return new Response('OK', { status: 200 });
  } catch (error: any) {
    if (error.code === 410) await redis.del('google_calendar_sync_token');
    return new Response('OK', { status: 500 });
  }
}