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
    const isSetup = searchParams.get('setup');

    if (isSetup === 'true') {
      await calendar.events.watch({
        calendarId: CALENDAR_ID,
        requestBody: {
          id: `channel-${Date.now()}`,
          type: 'web_hook',
          address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhook/calendar`,
        },
      });
      const response = await calendar.events.list({ calendarId: CALENDAR_ID });
      if (response.data.nextSyncToken) await redis.set('google_calendar_sync_token', response.data.nextSyncToken);
      return Response.json({ success: true });
    }
    
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

    const allItems = response.data.items || [];
    const now = Date.now();
    const bookedTimes = new Set();
    const availableItems: any[] = [];

    for (const ev of allItems) {
      if (ev.summary?.startsWith('CONFIRMED')) {
        bookedTimes.add(ev.start?.dateTime);
      } else if (ev.summary?.startsWith('PENDING')) {
        const data = JSON.parse(ev.description || '{}');
        // If expired (10 mins), treat it as AVAILABLE immediately in the response
        if (now - (data.pendingAt || 0) > 600000) {
          // Fire and forget the update to Google, but keep the slot for the UI
          calendar.events.patch({ 
            calendarId: CALENDAR_ID, 
            eventId: ev.id!, 
            requestBody: { summary: 'Available', description: '', location: '' } 
          });
          availableItems.push(ev); 
        } else {
          bookedTimes.add(ev.start?.dateTime);
        }
      } else if (ev.summary === 'Available') {
        availableItems.push(ev);
      }
    }

    // Filter out any "Available" slots that are covered by a "CONFIRMED" slot
    const finalSlots = availableItems.filter(ev => !bookedTimes.has(ev.start?.dateTime));
    return Response.json({ slots: finalSlots });

  } catch (error: any) {
    return Response.json({ error: error.message, slots: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "";
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      const oldData = JSON.parse(oldEvent.data.description || '{}');

      if (oldData.rescheduled === true) {
        return Response.json({ error: "This appointment has already been rescheduled once." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const start = newSlot.data.start?.dateTime;
      const end = newSlot.data.end?.dateTime;

      // 1. Clear overlapping Available slots at target
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: start!,
        timeMax: end!,
        singleEvents: true
      });
      for (const ev of (overlaps.data.items || [])) {
        if (ev.id !== eventId && ev.summary === 'Available') {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id! });
        }
      }

      const timeStr = new Date(start!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
      const reschedUrl = `${baseUrl}/consultation?reschedule=${eventId}`;
      
      const newDesc = JSON.stringify({ 
        ...oldData, 
        rescheduled: true, 
        lastUpdatedBy: 'system_webhook', 
        lastNotifiedTime: start 
      });

      // 2. Mark New Slot as Confirmed
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { 
          summary: `CONFIRMED (Rescheduled): ${oldData.name}`, 
          location: meetLink, 
          description: newDesc 
        }
      });

      // 3. Revert Old Slot to Available
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      // 4. Notification
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: oldData.email,
        subject: `Reschedule Confirmed - ${oldData.name}`,
        html: `<div style="font-family: sans-serif; padding: 20px;">
                <h2>Reschedule Successful</h2>
                <p>Namaste ${oldData.name}, your appointment is now at <b>${timeStr}</b>.</p>
                <p><a href="${meetLink}" style="background:#E8A856; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">Join Meeting</a></p>
                <p style="font-size:12px; color:#666; margin-top:20px;">Link to your booking: <a href="${reschedUrl}">${reschedUrl}</a></p>
              </div>`
      });

      return Response.json({ success: true });
    }

    // New Booking Flow
    const pendingPayload = JSON.stringify({ ...patientData, pendingAt: Date.now(), rescheduled: false });
    await calendar.events.patch({ 
      calendarId: CALENDAR_ID, 
      eventId: eventId, 
      requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingPayload } 
    });
    
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` 
      },
      body: JSON.stringify({ amount: Number(process.env.RAZORPAY_AMOUNT), currency: "INR", notes: { booking_id: eventId } })
    });
    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id });
  } catch (error) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}