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

      // 2. Mark new event as confirmed and save patient data to description
      const update = await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: eventId,
        requestBody: {
          summary: `CONFIRMED: ${patientData.name}`,
          location: meetLink,
          description: `PATIENT: ${patientData.name}\nPHONE: ${patientData.phone}\nEMAIL: ${patientData.email}\nSYMPTOMS: ${patientData.symptoms}\n(Rescheduled)`.trim()
        }
      });

      // 3. Format Time Range
      const start = update.data.start?.dateTime;
      const end = update.data.end?.dateTime;
      const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' };
      const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' };

      const formattedTime = start && end
        ? `${new Date(start).toLocaleString('en-IN', dateOptions)}, ${new Date(start).toLocaleTimeString('en-IN', timeOptions)} - ${new Date(end).toLocaleTimeString('en-IN', timeOptions)}`
        : "Scheduled Time";

      // --- 4. NOTIFY VIA WHATSAPP/SMS ---
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        const cleanPhone = patientData.phone.toString().replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('91') ? `+${cleanPhone}` : `+91${cleanPhone}`;

        // Send WhatsApp
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your reschedule is successful!\n\n📅 *New Time:* ${formattedTime}\n🔗 *Link:* ${meetLink}`,
          from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
          to: `whatsapp:${formattedPhone}`
        });
      } catch (e) { console.error("Twilio Reschedule Notify Error:", e); }

      // --- 5. NOTIFY VIA EMAIL ---
      if (patientData.email && process.env.EMAIL_PASS) {
        try {
          const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
          });

          await transporter.sendMail({
            from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
            to: patientData.email,
            subject: `Rescheduled Successfully: ${patientData.name}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; color: #123025; border: 1px solid #eee; border-radius: 10px;">
                <h2 style="color: #123025;">Reschedule Confirmed</h2>
                <p>Namaste <strong>${patientData.name}</strong>,</p>
                <p>Your appointment has been successfully moved to:</p>
                <p style="font-size: 18px; font-weight: bold; color: #E8A856;">${formattedTime}</p>
                <p>Meeting Link (remains same): <a href="${meetLink}">${meetLink}</a></p>
              </div>
            `
          });
        } catch (e) { console.error("Email Reschedule Notify Error:", e); }
      }

      return Response.json({ success: true });
    }

    // --- CASE 2: NEW BOOKING (Logic stays the same) ---
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
        amount: 20000, // Matching your frontend 200.00
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