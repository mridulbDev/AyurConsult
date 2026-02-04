import { calendar, CALENDAR_ID } from '@/lib/calendar';
import crypto from 'crypto';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-razorpay-signature');
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(body).digest('hex');

  if (signature !== expected) return new Response('Unauthorized', { status: 400 });

  const data = JSON.parse(body);
  if (data.event !== 'payment.captured') return new Response('OK', { status: 200 });

  const bookingId = data.payload.payment.entity.notes?.booking_id;
  
  // Update GCal to CONFIRMED. This will trigger the Calendar Webhook once.
  const event = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: bookingId });
  const patientData = JSON.parse(event.data.description || '{}');

  await calendar.events.patch({
    calendarId: CALENDAR_ID,
    eventId: bookingId,
    requestBody: {
      summary: `✅ CONFIRMED: ${patientData.firstName} ${patientData.lastName}`,
      colorId: '10' // Bold Green
    }
  });

  return new Response('OK', { status: 200 });
}