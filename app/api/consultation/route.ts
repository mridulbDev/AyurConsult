import { google } from 'googleapis';
import nodemailer from 'nodemailer';

// --- CONFIGURATION & AUTH ---
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const getAuth = () => {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
};

const calendar = google.calendar({ version: 'v3', auth: getAuth() });

// --- HELPER: SEND EMAIL ---
async function sendNotificationEmail(to: string, name: string, timeStr: string, meetLink: string, bookingId: string) {
  const rescheduleLink = `${process.env.NEXT_PUBLIC_BASE_URL}/consultation?reschedule=${bookingId}`;
  
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.DOCTOR_EMAIL, pass: process.env.EMAIL_PASS }
  });

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
      <h2>Namaste ${name},</h2>
      <p>Your consultation has been successfully scheduled/rescheduled.</p>
      <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
        <p><strong>🕒 Time:</strong> ${timeStr}</p>
        <p><strong>📹 Join Meeting:</strong> <a href="${meetLink}">${meetLink}</a></p>
      </div>
      <p style="font-size: 12px; color: #666;">
        Need to change this time? <a href="${rescheduleLink}">Click here to Reschedule</a>
        <br>(Note: You can only reschedule once using this link).
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Dr. Dixit Ayurveda" <${process.env.DOCTOR_EMAIL}>`,
    to: to,
    subject: `Consultation Confirmed: ${timeStr}`,
    html: htmlContent
  });
}

/**
 * GET: Fetches slots. Performs lazy cleanup of expired PENDING slots (5 mins).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const bookingId = searchParams.get('bookingId');

    // 1. Fetch details for Reschedule Page
    if (bookingId) {
      const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
      // If event is available or cancelled, the booking ID is invalid/expired
      if (event.data.status === 'cancelled' || event.data.summary === 'Available') {
        return Response.json({ details: null, error: "Invalid or expired booking" });
      }
      return Response.json({ details: JSON.parse(event.data.description || '{}') });
    }

    // 2. Fetch Slots for Date
    if (!date) return Response.json({ slots: [] });

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: `${date}T00:00:00+05:30`,
      timeMax: `${date}T23:59:59+05:30`,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const allItems = response.data.items || [];
    const now = Date.now();
    const bookedTimes = new Set();
    const availableItems: any[] = [];

    for (const ev of allItems) {
      const summary = ev.summary || '';
      
      if (summary.startsWith('CONFIRMED')) {
        bookedTimes.add(ev.start?.dateTime);
      } 
      else if (summary.startsWith('PENDING')) {
        try {
          const data = JSON.parse(ev.description || '{}');
          const elapsed = now - (data.pendingAt || 0);
          
          // --- LOGIC: 5 MINUTE TIMEOUT (300,000 ms) ---
          if (elapsed > 300000) { 
            console.log(`Releasing expired pending slot: ${ev.id}`);
            await calendar.events.patch({
              calendarId: CALENDAR_ID,
              eventId: ev.id!,
              requestBody: { summary: 'Available', description: '', location: '' } // Clear data
            });
            availableItems.push(ev); // It is now available again
          } else {
            bookedTimes.add(ev.start?.dateTime); // Still valid pending
          }
        } catch (e) {
          bookedTimes.add(ev.start?.dateTime);
        }
      } 
      else if (summary === 'Available') {
        availableItems.push(ev);
      }
    }

    // Strict filtering: Remove available slots that share a start time with a booked/pending slot
    const processedSlots = availableItems.filter(ev => !bookedTimes.has(ev.start?.dateTime));
    
    return Response.json({ slots: processedSlots });

  } catch (error: any) {
    console.error("GET Error:", error.message);
    return Response.json({ slots: [], error: error.message }, { status: 500 });
  }
}

/**
 * POST: Handles Initial Booking (Razorpay) OR Rescheduling
 */
export async function POST(req: Request) {
  try {
    const { eventId, patientData, rescheduleId } = await req.json();
    const meetLink = process.env.NEXT_PUBLIC_MEET_LINK || "";

    // ==========================================
    // WORKFLOW: RESCHEDULING (No Payment Needed)
    // ==========================================
    if (rescheduleId) {
      // 1. Validate Old Event
      const oldEvent = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: rescheduleId });
      if (oldEvent.data.summary === 'Available') {
        return Response.json({ error: "Booking already cancelled or moved." }, { status: 400 });
      }

      const oldData = JSON.parse(oldEvent.data.description || '{}');

      // 2. Enforce One-Time Reschedule Rule
      if (oldData.rescheduled === true) {
        return Response.json({ error: "You have already rescheduled once. Please contact support." }, { status: 400 });
      }

      const newSlot = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventId });
      const newStartTime = newSlot.data.start?.dateTime;

      if (!newStartTime) return Response.json({ error: "Invalid target slot" }, { status: 400 });

      // 3. ATOMIC MOVE: Revert Old Slot to Available (Clean Slate)
      await calendar.events.patch({
        calendarId: CALENDAR_ID,
        eventId: rescheduleId,
        requestBody: { 
          summary: 'Available', 
          description: '',  // IMPORTANT: Remove all patient data
          location: '' 
        }
      });

      // 4. PREPARE NEW SLOT: Remove 'Available' ghost slots at destination if any
      const overlaps = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: newStartTime,
        timeMax: newSlot.data.end?.dateTime!,
        singleEvents: true
      });

      // Delete any "Available" event at this time that isn't the one we are about to fill
      // (This handles the case where doctor manually created availability)
      for (const ev of (overlaps.data.items || [])) {
        if (ev.id !== eventId && ev.summary === 'Available') {
          await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: ev.id! });
        }
      }

      // 5. CONFIRM NEW SLOT
      const newDesc = JSON.stringify({ 
        ...oldData, 
        rescheduled: true, // Lock this slot from future user-reschedules
        lastUpdatedBy: 'USER', // Webhook will ignore this
        lastNotifiedTime: newStartTime 
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

      // 6. Send Email
      const timeStr = new Date(newStartTime).toLocaleString('en-IN', { 
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' 
      });
      
      // Send notification for the NEW event ID
      await sendNotificationEmail(oldData.email, oldData.name, timeStr, meetLink, eventId);

      return Response.json({ success: true });
    }

    // ==========================================
    // WORKFLOW: INITIAL BOOKING (Razorpay)
    // ==========================================
    
    // 1. Mark as PENDING (Holds slot for 5 mins via GET logic)
    const pendingPayload = JSON.stringify({ 
      ...patientData,
      eventId: eventId, 
      pendingAt: Date.now(), 
      rescheduled: false, 
      lastUpdatedBy: 'SYSTEM' 
    });

    await calendar.events.patch({ 
      calendarId: CALENDAR_ID, 
      eventId: eventId, 
      requestBody: { 
        summary: `PENDING: ${patientData.name}`, 
        description: pendingPayload 
      } 
    });

    // 2. Create Razorpay Order
    const razorpayRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        'Authorization': `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64')}` 
      },
      body: JSON.stringify({ 
        amount: Number(process.env.RAZORPAY_AMOUNT), 
        currency: "INR",
        notes: { booking_id: eventId } 
      })
    });

    const order = await razorpayRes.json();
    return Response.json({ orderId: order.id });

  } catch (error: any) {
    console.error("POST Error:", error);
    return Response.json({ error: "Server Error" }, { status: 500 });
  }
}