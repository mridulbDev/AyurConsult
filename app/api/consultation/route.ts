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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const bookingId = searchParams.get('bookingId');

    if (bookingId) {
      const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
      if (event.data.summary === 'Available') {
        return Response.json(
          { error: "This link has already been used or has expired." }, 
          { status: 410 } 
        );
      }

      const details = JSON.parse(event.data.description || '{}');

      //  THE SEAL: If metadata says already rescheduled
      if (details.rescheduled === true) {
        return Response.json(
          { error: "One-time reschedule limit reached for this booking." }, 
          { status: 403 }
        );
      }
        
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
        if (now - (data.pendingAt || 0) > 300000) { // 5 Minute Expiry
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
  } catch (error) { return Response.json({ slots: [] }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      const oldData = JSON.parse(oldEvent.data.description || '{}');

      if (oldEvent.data.summary === 'Available') {
    return Response.json({ error: "This link has already been used." }, { status: 410 });
  }

  


  // If the doctor moved the event or it's a second-gen move, 
  // the flag will be here.
  if (oldData.data.rescheduled === true) {
    return Response.json({ error: "One-time reschedule limit reached." }, { status: 400 });
  }
      await calendar.events.patch({ calendarId: CALENDAR_ID, eventId: rescheduleId, requestBody: { summary: 'Available', description: '', location: '' } });

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const start = newSlot.data.start?.dateTime;

      

      const updatedDesc = JSON.stringify({ ...patientData, rescheduled: true, lastUpdatedBy: 'user', lastNotifiedTime: start });

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { summary: `CONFIRMED (Rescheduled): ${patientData.name}`, location: process.env.NEXT_PUBLIC_MEET_LINK, description: updatedDesc }
      });

      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
      // Replace your existing transporter.sendMail line with this:
      // Inside POST -> if (rescheduleId)
const timeStr = new Date(start!).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', // <--- THIS FIXES THE 9 AM ISSUE
  dateStyle: 'full',
  timeStyle: 'short'
});

await transporter.sendMail({
  from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
  to: patientData.email,
  subject: `Reschedule Successful`,
  html: `<p>Namaste ${patientData.name},</p>
         <p>Your appointment has been moved to: <b>${timeStr}</b></p>
         <p><a href="${process.env.NEXT_PUBLIC_MEET_LINK}">Join Meeting Link</a></p>`
});

      return Response.json({ success: true, eventId: eventId });
    }

    const pendingPayload = JSON.stringify({ ...patientData, pendingAt: Date.now(), rescheduled: false, lastUpdatedBy: 'system' });
    await calendar.events.patch({ calendarId: CALENDAR_ID, eventId: eventId, requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingPayload } });

    const rzp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` },
      body: JSON.stringify({ amount: Number(process.env.NEXT_PUBLIC_RAZORPAY_AMOUNT), currency: "INR", notes: { booking_id: eventId } })
    });
    const order = await rzp.json();
    console.log("Razorpay Order Created:");
    return Response.json({ orderId: order.id });
    
  } catch (error) { return Response.json({ error: "Failed" }, { status: 500 }); }
}