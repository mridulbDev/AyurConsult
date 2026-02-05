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
      let details = {};
      try { details = JSON.parse(event.data.description || '{}'); } catch (e) { details = {}; }
      return Response.json({ details, summary: event.data.summary, start: event.data.start });
    }

    if (!date) return Response.json({ slots: [] });

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: `${date}T00:00:00Z`,
      timeMax: `${date}T23:59:59Z`,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const allItems = response.data.items || [];
    const now = Date.now();
    const bookedTimes = new Set();
    const availableItems: any[] = [];

    for (const ev of allItems) {
      if (ev.summary?.includes('CONFIRMED')) {
        bookedTimes.add(ev.start?.dateTime);
      } else if (ev.summary?.includes('PENDING')) {
        try {
          const data = JSON.parse(ev.description || '{}');
          const elapsed = now - (data.pendingAt || 0);
          // Workflow: If payment not confirmed within 5 mins, revert to Available
          if (elapsed > 300000) { 
            await calendar.events.patch({
              calendarId: CALENDAR_ID,
              eventId: ev.id!,
              requestBody: { summary: 'Available', description: '', location: '' }
            });
            availableItems.push(ev);
          } else {
            bookedTimes.add(ev.start?.dateTime);
          }
        } catch (e) {
          bookedTimes.add(ev.start?.dateTime);
        }
      } else if (ev.summary === 'Available') {
        availableItems.push(ev);
      }
    }

    const processedSlots = availableItems.filter(ev => !bookedTimes.has(ev.start?.dateTime));
    return Response.json({ slots: processedSlots });
  } catch (error: any) {
    return Response.json({ slots: [], error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      const oldData = JSON.parse(oldEvent.data.description || '{}');

      // Workflow Step 3: Prevent multiple patient-initiated reschedules
      if (oldData.rescheduled === true) {
        return Response.json({ error: "Multiple reschedules not permitted." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const start = newSlot.data.start?.dateTime;

      // 1. Revert old slot
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      // 2. Clean up "Available" slot at destination to prevent duplicates
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: start!,
        timeMax: newSlot.data.end?.dateTime!,
        singleEvents: true
      });
      for (const ev of (overlaps.data.items || [])) {
        if (ev.id !== eventId && ev.summary === 'Available') {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id! });
        }
      }

      // 3. Confirm New Slot
      const newDesc = JSON.stringify({ 
        ...oldData, 
        rescheduled: true, 
        lastUpdatedBy: 'USER',
        lastNotifiedTime: start 
      });

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { 
          summary: `CONFIRMED (Rescheduled): ${oldData.firstName} ${oldData.lastName}`, 
          location: meetLink, 
          description: newDesc 
        }
      });

      const timeStr = new Date(start!).toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      });

      await sendNotifications(oldData, timeStr, "Reschedule Confirmed");
      return Response.json({ success: true });
    }

    // INITIAL BOOKING: Mark as PENDING
    const pendingPayload = JSON.stringify({ 
      ...patientData,
      pendingAt: Date.now(), 
      rescheduled: false, 
      lastUpdatedBy: 'SYSTEM' 
    });

    await calendar.events.patch({ 
      calendarId: CALENDAR_ID, 
      eventId: eventId, 
      requestBody: { 
        summary: `PENDING: ${patientData.firstName}`, 
        description: pendingPayload 
      } 
    });

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` 
      },
      body: JSON.stringify({ 
        amount: Number(process.env.RAZORPAY_AMOUNT) * 100, // Amount in paise
        currency: "INR",
        notes: { booking_id: eventId } 
      })
    });

    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id });

  } catch (error: any) {
    return Response.json({ error: "Server Error" }, { status: 500 });
  }
}

async function sendNotifications(data: any, timeStr: string, subject: string) {
  const transporter = nodemailer.createTransport({ 
    service: 'gmail', 
    auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } 
  });

  const mailOptions = {
    from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
    to: data.email,
    subject: subject,
    text: `Namaste, your session is confirmed for ${timeStr}. Join: ${process.env.NEXT_PUBLIC_MEET_LINK}`,
  };

  await transporter.sendMail(mailOptions);
  
  // Twilio WhatsApp Logic
  const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  await twilioClient.messages.create({
    body: `Namaste ${data.firstName}, ${subject}! 📅 Time: ${timeStr}. Join: ${process.env.NEXT_PUBLIC_MEET_LINK}`,
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:+91${data.mobile.toString().slice(-10)}`
  });
}