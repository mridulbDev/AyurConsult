import { google } from 'googleapis';
import { Redis } from '@upstash/redis';
import nodemailer from 'nodemailer';

const redis = Redis.fromEnv();
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export async function POST(req: Request) {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: SCOPES,
    });
    const calendar = google.calendar({ version: 'v3', auth });

    // Handle Google Sync Verification
    if (req.headers.get('x-goog-resource-state') === 'sync') {
      return new Response('OK', { status: 200 });
    }

    // 1. Fetch Changes using Sync Token
    const syncToken = await redis.get<string>('google_calendar_sync_token');
    
    // If sync token expired (410) or missing, perform full sync (omitted for brevity, assume simple list)
    let response;
    try {
      response = await calendar.events.list({ calendarId: CALENDAR_ID, syncToken: syncToken || undefined });
    } catch (e: any) {
      if (e.code === 410) {
        // Token invalid, clear it and return. Next run will catch up.
        await redis.del('google_calendar_sync_token'); 
        return new Response('Sync Token Reset', { status: 200 });
      }
      throw e;
    }

    if (response.data.nextSyncToken) {
      await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
    }

    const changedEvents = response.data.items || [];

    for (const event of changedEvents) {
      // 2. Filter: We only care about active, confirmed events
      if (event.status === 'cancelled' || !event.summary?.includes('CONFIRMED') || !event.description) {
        continue;
      }

      let data;
      try { data = JSON.parse(event.description); } catch { continue; }

      const currentStart = event.start?.dateTime;
      if (!currentStart) continue;

      // 🛑 CRITICAL CHECK: "Has the Doctor manually moved this?"
      // If the time in the calendar matches what we last notified, NOTHING changed (or it was a System update).
      // If they DIFFER, the Doctor dragged the event.
      if (data.lastNotifiedTime === currentStart) {
        continue; // Ignore this event
      }

      // ======================================================
      // DOCTOR MANUAL RESCHEDULE DETECTED
      // ======================================================
      console.log(`Doctor moved event ${event.id} to ${currentStart}`);

      // 3. Prevent Overlaps: Remove "Available" slots at the new destination
      const listDest = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: currentStart,
        timeMax: event.end?.dateTime!,
        singleEvents: true
      });
      
      const ghost = listDest.data.items?.find(e => e.summary === 'Available' && e.id !== event.id);
      if (ghost) {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ghost.id! });
      }

      // 4. Update Metadata to prevent loop & save new state
      const updatedDesc = JSON.stringify({ 
        ...data, 
        lastNotifiedTime: currentStart, // Sync time so next webhook ignores
        lastUpdatedBy: 'DOCTOR' 
        // Note: We do NOT change 'rescheduled' status. 
        // If patient had used their 1 chance, they still can't use the OLD link, 
        // but the new email sends a link for this specific event ID.
      });

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: event.id!,
        requestBody: { description: updatedDesc }
      });

      // 5. Send Notification Email
      const timeStr = new Date(currentStart).toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      });
      const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || '#';
      const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${event.id}`;

      const transporter = nodemailer.createTransport({ 
        service: 'gmail', 
        auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
      });

      const htmlContent = `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2>Appointment Update</h2>
          <p>Namaste <strong>${data.name}</strong>,</p>
          <p>Dr. Dixit has moved your consultation to a new time.</p>
          <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 15px 0;">
            <p><strong>📅 New Time:</strong> ${timeStr}</p>
            <p><strong>🔗 Video Link:</strong> <a href="${meetLink}">${meetLink}</a></p>
          </div>
          <p style="font-size: 12px; color: #555;">
             <a href="${rescheduleLink}">Reschedule Link</a>
          </p>
        </div>
      `;

      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: data.email,
        subject: `Reschedule Alert: ${timeStr}`,
        html: htmlContent
      });
    }

    return new Response('OK', { status: 200 });
  } catch (error: any) {
    console.error("Calendar Webhook Error:", error);
    return new Response('OK', { status: 200 });
  }
}