import { NextResponse } from 'next/server';
const twilio = require('twilio');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 1. Only act if payment is successful
    if (body.event === 'payment.captured') {
      const bookingId = body.payload.payment.entity.notes.bookingId;
      const patientPhone = body.payload.payment.entity.contact;

      // 2. FETCH FULL DATA FROM CAL.COM (Using V1 to get symptoms/responses)
      const calRes = await fetch(`https://api.cal.com/v1/bookings/${bookingId}?apiKey=${process.env.CAL_API_KEY}`);
      const calData = await calRes.json();

      if (!calData.booking) throw new Error("Booking not found on Cal.com");

      const { location, attendees, responses, startTime } = calData.booking;
      const patientName = attendees[0].name;
      const symptoms = responses.symptoms || "No symptoms provided";
      // Format the date for the message
      const appointmentTime = new Date(startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

      // 3. CONFIRM THE BOOKING (Moving it from 'Pending' to 'Confirmed')
      // Note: V2 API is usually required for the /confirm endpoint
      const confirmRes = await fetch(`https://api.cal.com/v2/bookings/${bookingId}/confirm`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${process.env.CAL_API_KEY}`, // V2 uses Bearer token usually
          'Content-Type': 'application/json' 
        }
      });

      if (confirmRes.ok) {
        // 4. SEND WHATSAPP TO PATIENT
        await client.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`, 
          to: `whatsapp:${patientPhone}`,
          body: `Pranam ${patientName}! Your appointment with Prof. Mahesh Dixit is CONFIRMED.\n\n📅 Time: ${appointmentTime}\n📍 Mode/Link: ${location}\n\nPlease join 5 mins early.`
        });

        // 5. SEND WHATSAPP TO DR. DIXIT
        await client.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:+91${process.env.DR_DIXIT_PHONE}`, 
          body: `New Confirmed Booking!\n\nPatient: ${patientName}\nTime: ${appointmentTime}\nSymptoms: ${symptoms}\nMode: ${location}`
        });
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}