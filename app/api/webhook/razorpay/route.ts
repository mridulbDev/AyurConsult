import { google } from 'googleapis';
import twilio from 'twilio';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.text();
    const signature = req.headers.get('x-razorpay-signature');
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');

    if (signature !== expectedSignature) return new Response('Unauthorized', { status: 400 });

    const data = JSON.parse(body);
    if (data.event !== 'payment.captured') return new Response('OK', { status: 200 });

    const bookingId = data.payload.payment.entity.notes?.booking_id;
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });

    const event = await calendar.events.get({ calendarId: process.env.GOOGLE_CALENDAR_ID, eventId: bookingId });
    const patientData = JSON.parse(event.data.description || '{}');
    const start = event.data.start?.dateTime;

    const finalDesc = JSON.stringify({
      ...patientData,
      rescheduled: false,
      lastUpdatedBy: 'system',
      lastNotifiedTime: start
    });

    await calendar.events.patch({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      eventId: bookingId,
      requestBody: {
        summary: `CONFIRMED: ${patientData.name}`,
        location: process.env.NEXT_PUBLIC_MEET_LINK,
        description: finalDesc
      }
    });

    // Send Initial Confirmation SMS/Email here...
    return new Response('OK', { status: 200 });
  } catch (error) { return new Response('Error', { status: 500 }); }
}