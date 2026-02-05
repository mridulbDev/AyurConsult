import { google } from 'googleapis';
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

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
});

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
    const availableSlots = [];

    for (const ev of items) {
      if (ev.summary === 'Available') {
        availableSlots.push(ev);
      } else if (ev.summary?.startsWith('PENDING')) {
        const data = JSON.parse(ev.description || '{}');
        // 5 MINUTE TIMEOUT CLEANUP
        if (now - (data.pendingAt || 0) > 300000) { 
          await calendar.events.patch({
            calendarId: CALENDAR_ID,
            eventId: ev.id!,
            requestBody: { summary: 'Available', description: '', location: '' }
          });
          availableSlots.push(ev);
        }
      }
    }

    return Response.json({ slots: availableSlots });
  } catch (error) {
    return Response.json({ slots: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK!;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    // CASE: USER RESCHEDULING
    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      const oldData = JSON.parse(oldEvent.data.description || '{}');

      if (oldData.rescheduled === true) {
        return Response.json({ error: "Only one reschedule allowed via link." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const start = newSlot.data.start?.dateTime;

      // Reset Old Slot
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      // Update New Slot
      const updatedDesc = JSON.stringify({ 
        ...oldData, 
        ...patientData, 
        rescheduled: true, 
        lastUpdatedBy: 'user', 
        lastNotifiedTime: start 
      });

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { 
          summary: `CONFIRMED (Rescheduled): ${patientData.name}`, 
          location: meetLink, 
          description: updatedDesc 
        }
      });

      const timeStr = new Date(start!).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
      
      await transporter.sendMail({
        from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
        to: patientData.email,
        subject: `Reschedule Confirmed - ${patientData.name}`,
        html: `<p>Namaste ${patientData.name}, your appointment is moved to <b>${timeStr}</b>.</p>
               <p><a href="${meetLink}">Join Meet</a> | <a href="${baseUrl}/consultation?reschedule=${eventId}">View Details</a></p>`
      });

      return Response.json({ success: true });
    }

    // CASE: INITIAL BOOKING (PENDING)
    const pendingPayload = JSON.stringify({ ...patientData, pendingAt: Date.now(), rescheduled: false, lastUpdatedBy: 'system' });
    await calendar.events.patch({ 
      calendarId: CALENDAR_ID, 
      eventId: eventId, 
      requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingPayload } 
    });

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` },
      body: JSON.stringify({ amount: Number(process.env.RAZORPAY_AMOUNT), currency: "INR", notes: { booking_id: eventId } })
    });
    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id });
  } catch (error) {
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}