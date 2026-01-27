

import { NextResponse } from 'next/server';
import { validateWebhookSignature } from 'razorpay/dist/utils/razorpay-utils';
import twilio from 'twilio';


const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function POST(req: Request) {
  try {
    // 1. Get the raw text for signature verification
    const rawBody = await req.text(); 
    const signature = req.headers.get('x-razorpay-signature');
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 2. Verify it's actually from Razorpay
    const isValid = validateWebhookSignature(rawBody, signature!, secret!);
    if (!isValid) {
      return NextResponse.json({ status: 'unauthorized' }, { status: 401 });
    }

    // 3. Parse the rawBody string into a JSON object
    const body = JSON.parse(rawBody);

    // 4. Filter for successful payment events
    if (body.event === 'payment.captured' || body.event === 'payment_link.paid') {
      const payment = body.payload.payment.entity;
      const bookingId = payment.notes.bookingId;
      const patientPhone = payment.contact;

      // 5. Fetch details from Cal.com (V1)
      const calRes = await fetch(`https://api.cal.com/v1/bookings/${bookingId}?apiKey=${process.env.CAL_API_KEY}`);
      const calData = await calRes.json();

      const { location, attendees, responses, startTime } = calData.booking;
      const patientName = attendees[0].name;
      const symptoms = responses.symptoms || "No symptoms provided";
      const appointmentTime = new Date(startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      // 6. Confirm the seat in Cal.com (V2)
      await fetch(`https://api.cal.com/v2/bookings/${bookingId}/confirm`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.CAL_API_KEY}`, 'Content-Type': 'application/json' }
      });

      // 7. Send WhatsApp via Twilio
      await client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, 
        to: `whatsapp:${patientPhone}`,
        body: `Pranam ${patientName}! Your appointment with Prof. Mahesh Dixit is CONFIRMED.\n📅 Time: ${appointmentTime}\n📍 Link: ${location}`
      });

      await client.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:+91${process.env.DR_DIXIT_PHONE}`, 
          body: `New Confirmed Booking!\n\nPatient: ${patientName}\nTime: ${appointmentTime}\nSymptoms: ${symptoms}\nMode: ${location}`
        });
    }

    // Always tell Razorpay "Message Received"
    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}