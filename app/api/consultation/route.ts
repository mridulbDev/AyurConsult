import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: `${date}T00:00:00+05:30`, 
      timeMax: `${date}T23:59:59+05:30`,
      singleEvents: true,
    });

    const allItems = response.data.items || [];
    const now = Date.now();
    const processedSlots = [];

    // AUTO-CLEANUP: Check for expired PENDING slots (older than 10 mins)
    for (const ev of allItems) {
      if (ev.summary?.startsWith('PENDING')) {
        try {
          const data = JSON.parse(ev.description || '{}');
          const pendingAt = data.pendingAt || 0;

          if (now - pendingAt > 600000) { // 10 minutes in milliseconds
            await calendar.events.patch({
              calendarId: CALENDAR_ID,
              eventId: ev.id!,
              requestBody: { summary: 'Available', description: '' }
            });
            ev.summary = 'Available'; 
          }
        } catch (e) {
          console.error("Cleanup parse error for event:", ev.id);
        }
      }

      if (ev.summary === 'Available') {
        processedSlots.push(ev);
      }
    }

    return Response.json({ slots: processedSlots });
  } catch (error) {
    console.error("GET Slots Error:", error);
    return Response.json({ slots: [] }, { status: 500 });
  }
}







export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

    // --- CASE 1: RESCHEDULE ---
    if (rescheduleId) {
      // 1. Mark old event as available
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '' }
      });

      // 2. Mark new event as confirmed
      const update = await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: {
          summary: `CONFIRMED: ${patientData.name}`,
          location: meetLink,
          description: `Phone: ${patientData.phone}\nSymptoms: ${patientData.symptoms}\n(Rescheduled)`
        }
      });

      const newTime = new Date(update.data.start?.dateTime || "").toLocaleString('en-IN', { 
        timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' 
      });

      // Notify
      const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
      await twilioClient.messages.create({
        body: `Rescheduled! Your session is now on ${newTime}. Link: ${meetLink}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+91${patientData.phone}`
      });

      return Response.json({ success: true });
    }

    // --- CASE 2: NEW BOOKING ---
    const pendingPayload = { ...patientData, pendingAt: Date.now() };
    await calendar.events.patch({
      calendarId: CALENDAR_ID, 
      eventId: eventId,
      requestBody: {
        summary: `PENDING: ${patientData.name}`,
        description: JSON.stringify(pendingPayload) 
      }
    });

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
      },
      body: JSON.stringify({
        amount: 50000, 
        currency: "INR",
        notes: { booking_id: eventId }
      })
    });

    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id, eventId });

  } catch (error) {
    console.error("POST Error:", error);
    return Response.json({ error: "Operation Failed" }, { status: 500 });
  }
}