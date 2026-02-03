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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const bookingId = searchParams.get('bookingId');
    
  const isSetup = searchParams.get('setup'); // Look for ?setup=true

  // --- NEW SETUP LOGIC ---
  if (isSetup === 'true') {
    try {
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/calendar'],
      });
      const calendar = google.calendar({ version: 'v3', auth });

      const watchRes = await calendar.events.watch({
        calendarId: process.env.GOOGLE_CALENDAR_ID!,
        requestBody: {
          id: `dr-dixit-sub-${Date.now()}`,
          type: 'web_hook',
          address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/calendar`, // Point to your webhook receiver
        },
      });

      return Response.json({ success: true, message: "Watch active", details: watchRes.data });
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

    if (bookingId) {
      const event = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId: bookingId,
      });
      const details = JSON.parse(event.data.description || '{}');
      return Response.json({ details });
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

    const bookedTimes = new Set(
      allItems
        .filter(ev => ev.summary?.startsWith('CONFIRMED') || ev.summary?.startsWith('PENDING'))
        .map(ev => ev.start?.dateTime)
    );

    const processedSlots = [];
    for (const ev of allItems) {
      if (ev.summary?.startsWith('PENDING')) {
        try {
          const data = JSON.parse(ev.description || '{}');
          if (now - (data.pendingAt || 0) > 600000) {
            await calendar.events.patch({
              calendarId: CALENDAR_ID,
              eventId: ev.id!,
              requestBody: { summary: 'Available', description: '' }
            });
            ev.summary = 'Available';
          }
        } catch (e) { console.error("Cleanup error", e); }
      }

      if (ev.summary === 'Available' && !bookedTimes.has(ev.start?.dateTime)) {
        processedSlots.push(ev);
      }
    }
    return Response.json({ slots: processedSlots });
  } catch (error) {
    return Response.json({ slots: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "https://meet.google.com/kzq-tfhm-wjp";

    // --- CASE 1: RESCHEDULE ---
    if (rescheduleId) {
      // 1. Get the OLD event to check if it has already been rescheduled
      const oldEventRes = await calendar.events.get({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
      });

      const oldData = JSON.parse(oldEventRes.data.description || '{}');

      // 🛑 CHECK: One-time limit
      if (oldData.rescheduled === true) {
        return Response.json(
          { error: "This appointment has already been rescheduled once. Further changes are not permitted." },
          { status: 400 }
        );
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const startTime = newSlot.data.start?.dateTime;
      const endTime = newSlot.data.end?.dateTime;

      // 2. WIPE OLD SLOT (Make it available again)
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      // 3. CLEANUP DUPLICATES AT NEW TIME
      if (startTime && endTime) {
        const existingEvents = await calendar.events.list({
          calendarId: CALENDAR_ID,
          timeMin: startTime,
          timeMax: endTime,
          singleEvents: true,
        });
        for (const ev of (existingEvents.data.items || [])) {
          if (ev.id !== eventId && ev.summary === 'Available') {
            await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id! });
          }
        }
      }

      // 4. CONFIRM NEW SLOT & SET FLAG
      const newDescriptionData = JSON.stringify({
        ...oldData,
        ...patientData,
        rescheduled: true, // Lock the patient out
        rescheduledAt: new Date().toISOString()
      });

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: {
          summary: `CONFIRMED (Rescheduled): ${patientData.name}`,
          location: meetLink,
          description: newDescriptionData
        }
      });

      const formattedTime = startTime
        ? new Date(startTime).toLocaleString('en-IN', {
          day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
        })
        : "Scheduled Time";

      // 5. NOTIFICATIONS
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const drPhone = process.env.DOCTOR_PHONE!;
        const patientPhone = `+91${patientData.phone.toString().replace(/\D/g, '').slice(-10)}`;

        if (process.env.EMAIL_PASS && process.env.DOCTOR_EMAIL) {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
          });
          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientData.email,
            subject: `Reschedule Confirmed - ${patientData.name}`,
            html: `<div style="font-family: sans-serif; padding: 20px; color: #123025;">
              <h2>Reschedule Successful</h2>
              <p>Namaste ${patientData.name}, your appointment is moved to: <b>${formattedTime}</b></p>
              <p><a href="${meetLink}" style="background: #E8A856; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Call</a></p>
            </div>`
          });
        }

        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, reschedule successful!\n\n📅 *New Time:* ${formattedTime}\n🔗 *Link:* ${meetLink}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${patientPhone}`
        });

        await twilioClient.messages.create({
          body: `🔄 *Reschedule Alert*\n\n👤 Patient: ${patientData.name}\n📅 New Time: ${formattedTime}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${drPhone.startsWith('+') ? drPhone : '+91' + drPhone}`
        });
      } catch (e) { console.error("Notification Error", e); }

      return Response.json({ success: true });
    }

    // --- CASE 2: NEW BOOKING (PENDING) ---
    const pendingPayload = JSON.stringify({ 
      ...patientData, 
      pendingAt: Date.now(),
      rescheduled: false // Initialize the flag
    });

    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: eventId,
      requestBody: { 
        summary: `PENDING: ${patientData.name}`, 
        description: pendingPayload 
      }
    });

    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}`
      },
      body: JSON.stringify({ amount: 20000, currency: "INR", notes: { booking_id: eventId } })
    });

    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id, eventId });

  } catch (error) {
    console.error("POST Error:", error);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}