import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
  key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

// api/consultation/route.ts

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const bookingId = searchParams.get('bookingId');

    if (!date) {
      // Return empty array instead of nothing
      return Response.json({ slots: [] });
    }
    if (bookingId) {

        const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });

        return Response.json({ details: JSON.parse(event.data.description || '{}') });

      }

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: `${date}T00:00:00Z`,
      timeMax: `${date}T23:59:59Z`,
      singleEvents: true,
    });

    const allItems  = response.data.items || [];
    // ... filtering logic ...
     const now = Date.now();

      const bookedTimes = new Set();

      const availableItems: any[] = [];



      for (const ev of allItems) {

        if (ev.summary?.startsWith('CONFIRMED')) {

          bookedTimes.add(ev.start?.dateTime);

        } else if (ev.summary?.startsWith('PENDING')) {

          try {

            const data = JSON.parse(ev.description || '{}');

            if (now - (data.pendingAt || 0) > 600000) {

              await calendar.events.patch({

                calendarId: CALENDAR_ID,

                eventId: ev.id!,

                requestBody: { summary: 'Available', description: '', location: '' }

              });

              availableItems.push(ev);

            } else {

              bookedTimes.add(ev.start?.dateTime);

            }

          } catch (e) { bookedTimes.add(ev.start?.dateTime); }

        } else if (ev.summary === 'Available') {

          availableItems.push(ev);

        }

      }



      const processedSlots = availableItems.filter(ev => !bookedTimes.has(ev.start?.dateTime));

      return Response.json({ slots: processedSlots });
    
  } catch (error) {
    console.error("Calendar Fetch Error:", error);
    // CRITICAL: Always return a valid JSON object even on 500
    return Response.json({ slots: [], error: "Failed to fetch slots" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "";
  

    // CASE: RESCHEDULE (User Side)
    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      const oldData = JSON.parse(oldEvent.data.description || '{}');

      // Strict Rule: User can only reschedule once
      if (oldData.rescheduled === true) {
        return Response.json({ error: "Reschedule limit reached (1 time only)." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const newStart = newSlot.data.start?.dateTime;

      // 1. Wipe Old Slot
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      // 2. Update New Slot with "Rescheduled: true"
      const newDesc = JSON.stringify({ 
        ...oldData, 
        rescheduled: true, 
        lastUpdatedBy: 'USER', 
        lastNotifiedTime: newStart 
      });

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { 
          summary: `CONFIRMED (Rescheduled): ${oldData.name}`, 
          location: meetLink, 
          description: newDesc 
        }
      });

      // Trigger Notification immediately for User Action
      await sendNotification(oldData.email, oldData.phone, newStart!, meetLink, "Reschedule Confirmed");
      return Response.json({ success: true });
    }

    // CASE: INITIAL BOOKING (Set to PENDING)
    const pendingPayload = JSON.stringify({ 
      ...patientData, 
      pendingAt: Date.now(), 
      rescheduled: false, 
      lastUpdatedBy: 'SYSTEM',
      lastNotifiedTime: null 
    });

    await calendar.events.patch({ 
      calendarId: CALENDAR_ID, 
      eventId: eventId, 
      requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingPayload } 
    });

    // Razorpay Order Creation
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` 
      },
      body: JSON.stringify({ amount: Number(process.env.RAZORPAY_AMOUNT) * 100, currency: "INR", notes: { booking_id: eventId } })
    });
    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id });

  } catch (error) {
    return Response.json({ error: "Operation failed" }, { status: 500 });
  }
}

async function sendNotification(email: string, phone: string, time: string, link: string, subject: string) {
  const timeStr = new Date(time).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
  
  // Email
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
  await transporter.sendMail({
    from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
    to: email,
    subject: subject,
    html: `<p>Namaste, your session is confirmed for: <b>${timeStr}</b>. <br>Join here: <a href="${link}">${link}</a></p>`
  });

  // WhatsApp (Twilio)
  const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  await twilioClient.messages.create({
    body: `Namaste! ${subject}: 📅 ${timeStr}. Link: ${link}`,
    from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    to: `whatsapp:+91${phone.toString().slice(-10)}`
  });
}