import { google } from 'googleapis';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  if (!date) return Response.json({ slots: [] });

  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: `${date}T00:00:00Z`,
    timeMax: `${date}T23:59:59Z`,
    singleEvents: true,
  });

  const events = res.data.items || [];
  // Filter: Must be 'Available' AND not overlapping with a PENDING/CONFIRMED event
  const bookedTimes = events
    .filter(e => e.summary?.includes('CONFIRMED') || e.summary?.includes('PENDING'))
    .map(e => e.start?.dateTime);

  const available = events.filter(e => 
    e.summary === 'Available' && !bookedTimes.includes(e.start?.dateTime)
  );

  return Response.json({ slots: available });
}

export async function POST(req: Request) {
  const { eventId, patientData, rescheduleId } = await req.json();
  
  // CASE: RESCHEDULE
  if (rescheduleId) {
    const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
    const metadata = JSON.parse(oldEvent.data.description || '{}');

    if (metadata.userRescheduled) {
      return Response.json({ error: "Only one reschedule allowed via link." }, { status: 400 });
    }

    // Move logic
    const targetSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId });
    
    // 1. Wipe old slot
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: rescheduleId,
      requestBody: { summary: 'Available', description: '', location: '' }
    });

    // 2. Occupy new slot
    const updatedMeta = { ...metadata, userRescheduled: true, lastUpdatedBy: 'system' };
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: eventId,
      requestBody: {
        summary: `CONFIRMED (Rescheduled): ${metadata.name}`,
        description: JSON.stringify(updatedMeta),
        location: process.env.NEXT_PUBLIC_MEET_LINK
      }
    });

    // Trigger notification manually here to avoid webhook loop
    // [Call Twilio/Nodemailer Logic]
    
    return Response.json({ success: true });
  }

  // CASE: NEW BOOKING (Pending Payment)
  const pendingMeta = JSON.stringify({ ...patientData, pendingAt: Date.now() });
  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId,
    requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingMeta }
  });

  // Razorpay Order Logic...
  return Response.json({ orderId: "..." });
}