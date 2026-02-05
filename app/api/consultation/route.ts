import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
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
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const bookingId = searchParams.get('bookingId');

    if (bookingId) {
      const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
      return Response.json({ details: JSON.parse(event.data.description || '{}') });
    }

    if (!date) return Response.json({ slots: [] });

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: `${date}T00:00:00+05:30`,
      timeMax: `${date}T23:59:59+05:30`,
      singleEvents: true,
    });

    const items = response.data.items || [];
    const now = Date.now();
    
    // Process Pending/Available logic
    const available = items.filter(ev => {
      if (ev.summary === 'Available') return true;
      if (ev.summary?.startsWith('PENDING')) {
        const data = JSON.parse(ev.description || '{}');
        if (now - (data.pendingAt || 0) > 600000) {
           calendar.events.patch({ calendarId: CALENDAR_ID, eventId: ev.id!, requestBody: { summary: 'Available', description: '', location: '' } });
           return true;
        }
      }
      return false;
    });

    return Response.json({ slots: available });
  } catch (error) { return Response.json({ slots: [] }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();

    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      const oldData = JSON.parse(oldEvent.data.description || '{}');

      // 🛑 STEP 3: LIMIT RESCHEDULE
      if (oldData.rescheduled === true) {
        return Response.json({ error: "Only one reschedule permitted." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const start = newSlot.data.start?.dateTime;

      // 1. Make old slot available
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      // 2. Clean up "Available" ghost at new slot
      const overlaps = await calendar.events.list({ calendarId: CALENDAR_ID, timeMin: start!, timeMax: newSlot.data.end?.dateTime!, singleEvents: true });
      for (const ev of (overlaps.data.items || [])) {
        if (ev.id !== eventId && ev.summary === 'Available') await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id! });
      }

      // 3. Confirm new slot
      const newDesc = JSON.stringify({ ...oldData, rescheduled: true, lastUpdatedBy: 'USER', lastNotifiedTime: start });
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { summary: `CONFIRMED: ${oldData.name}`, location: process.env.NEXT_PUBLIC_MEET_LINK, description: newDesc }
      });

      // Notifications...
      return Response.json({ success: true });
    }

    // Normal Booking Flow
    const pendingPayload = JSON.stringify({ ...patientData, pendingAt: Date.now(), rescheduled: false, lastUpdatedBy: 'SYSTEM' });
    await calendar.events.patch({ calendarId: CALENDAR_ID, eventId: eventId, requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingPayload } });

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` },
      body: JSON.stringify({ amount: Number(process.env.RAZORPAY_AMOUNT), currency: "INR", notes: { booking_id: eventId } })
    });
    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id });
  } catch (error) { return Response.json({ error: "Failed" }, { status: 500 }); }
}