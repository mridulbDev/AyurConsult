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

    // 🚩 ACTIVATE WEBHOOK (Trigger this by visiting /api/consultation?setup=true)
    
    
    

    if (isSetup === 'true') {
      // 1. Activate Webhook Watch
      const watchRes = await calendar.events.watch({
        calendarId: CALENDAR_ID,
        requestBody: {
          id: `channel-${Date.now()}`,
          type: 'web_hook',
          address: `${process.env.NEXT_PUBLIC_BASE_URL}/api/calendar`,
        },
      });

      // 2. Initial Full Sync to get the FIRST Token
      const response = await calendar.events.list({
        calendarId: CALENDAR_ID,
      });
      const initialToken = response.data.nextSyncToken;
      
      if (initialToken) {
        await redis.set('google_calendar_sync_token', initialToken);
      }

      return Response.json({ 
        success: true, 
        message: "Webhook and Token Initialized", 
        tokenSet: !!initialToken 
      });
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
        try {
          const data = JSON.parse(ev.description || '{}');
          const elapsed = now - (data.pendingAt || 0);
          if (elapsed > 600000) {
            calendar.events.patch({
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
  } catch (error:any) {
    console.error("DEBUG ERROR:", error.message); // This will show in Vercel Logs
    return Response.json({ error: error.message, slots: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "https://meet.google.com/kzq-tfhm-wjp";
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (rescheduleId) {
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      
      if (oldEvent.data.summary === 'Available' || !oldEvent.data.description) {
        return Response.json({ 
          error: "This reschedule link is no longer valid. The appointment has already been moved." 
        }, { status: 400 });
      }

      const oldData = JSON.parse(oldEvent.data.description || '{}');

      if (oldData.rescheduled === true) {
        return Response.json({ error: "This appointment has already been rescheduled once. Further changes are not permitted." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const start = newSlot.data.start?.dateTime;

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { summary: 'Available', description: '', location: '' }
      });

      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: start!,
        timeMax: newSlot.data.end?.dateTime!,
        singleEvents: true
      });
      for (const ev of (overlaps.data.items || [])) {
        if (ev.id !== eventId && ev.summary === 'Available') await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id! });
      }

      const newDesc = JSON.stringify({ ...oldData, ...patientData, rescheduled: true, lastUpdatedBy: 'user',lastNotifiedTime: start });
      const reschedUrl = `${baseUrl}/consultation?reschedule=${eventId}`;

      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: { 
          summary: `CONFIRMED (Rescheduled): ${patientData.name}`, 
          location: meetLink, 
          description: newDesc 
        }
      });

      const timeStr = new Date(start!).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const drPhone = process.env.DOCTOR_PHONE!;
        const patientPhone = `+91${patientData.phone.toString().replace(/\D/g, '').slice(-10)}`;
        

        if (process.env.EMAIL_PASS) {
          const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS } });
          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientData.email,
            subject: `Reschedule Confirmed - ${patientData.name}`,
            html: `<div style="font-family: sans-serif; padding: 20px; color: #123025;">
              <h2>Reschedule Successful</h2>
              <p>Namaste ${patientData.name}, your appointment is moved to: <b>${timeStr}</b></p>
              <p><a href="${meetLink}" style="background: #E8A856; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Join Call</a></p>
              <p style="font-size: 12px; color: #666;">If you need to change this again, please contact the doctor. You can view your booking here: <a href="${reschedUrl}">${reschedUrl}</a></p>
            </div>`
          });
        }

        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, reschedule successful!\n\n📅 *New Time:* ${timeStr}\n🔗 *Link:* ${meetLink}\nView/Reschedule: ${reschedUrl}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${patientPhone}`
        });

        await twilioClient.messages.create({
          body: `🔄 *Reschedule Alert*\n\n👤 Patient: ${patientData.name}\n📅 New Time: ${timeStr}\n🔗 Link: ${meetLink}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${drPhone.startsWith('+') ? drPhone : '+91' + drPhone}`
        });
      } catch (e) { console.error("Notification Error", e); }

      return Response.json({ success: true });
    }

    const pendingPayload = JSON.stringify({ ...patientData, pendingAt: Date.now(), rescheduled: false, lastUpdatedBy: 'system' });
    await calendar.events.patch({ calendarId: CALENDAR_ID, eventId: eventId, requestBody: { summary: `PENDING: ${patientData.name}`, description: pendingPayload } });

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