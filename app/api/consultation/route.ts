import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';

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

    // --- CASE 1: RESCHEDULING ---
    if (rescheduleId) {
      // 1. Reset the old slot
      await calendar.events.patch({ 
        calendarId: CALENDAR_ID, 
        eventId: rescheduleId, 
        requestBody: { summary: 'Available', description: '' } 
      });
      
      // 2. Confirm the new slot
      const update = await calendar.events.patch({
        calendarId: CALENDAR_ID, 
        eventId: eventId,
        conferenceDataVersion: 1,
        requestBody: {
          summary: `CONFIRMED: ${patientData.name}`,
          description: `Phone: ${patientData.phone}\nSymptoms: ${patientData.symptoms}\nHistory: ${patientData.history}`,
          conferenceData: { createRequest: { requestId: eventId, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
        }
      });

      const meetLink = update.data.hangoutLink;

      // 3. Notify Patient Immediately (No payment involved)
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail', 
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
          from: `"Dr. Dixit Ayurveda" <${process.env.EMAIL_USER}>`,
          to: patientData.email,
          subject: `Appointment Rescheduled - ${patientData.name}`,
          html: `
            <div style="font-family: Arial, sans-serif;">
              <h2>Namaste ${patientData.name},</h2>
              <p>Your appointment has been successfully moved.</p>
              <p><strong>New Meeting Link:</strong> <a href="${meetLink}">${meetLink}</a></p>
            </div>
          `
        });

        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        await twilioClient.messages.create({
          body: `Namaste ${patientData.name}, your session has been rescheduled! New Link: ${meetLink}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+91${patientData.phone}`
        });
      } catch (e) { console.error("Notification Error:", e); }

      return Response.json({ success: true, meetLink });
    }

    // --- CASE 2: NEW BOOKING (PENDING) ---
    // Save patient data + timestamp to description for the Webhook and Cleanup logic
    const pendingPayload = {
      ...patientData,
      pendingAt: Date.now()
    };

    await calendar.events.patch({
      calendarId: CALENDAR_ID, 
      eventId: eventId,
      requestBody: {
        summary: `PENDING: ${patientData.name}`,
        description: JSON.stringify(pendingPayload) 
      }
    });

    const baseUrl = process.env.NEXT_PUBLIC_RAZORPAY_PAYMENT_PAGE_URL;
    // const params = new URLSearchParams();
    // params.append('notes[booking_id]', eventId);
    
    // const paymentLink = `${baseUrl}?${params.toString()}`;


    // const paymentLink = `${baseUrl}?BookingID=${eventId}`;
    const paymentLink = `${baseUrl}?prefill[BookingID]=${eventId}`;

    return Response.json({ paymentLink });

  } catch (error) {
    console.error("POST Booking Error:", error);
    return Response.json({ error: "Failed to process booking" }, { status: 500 });
  }
}