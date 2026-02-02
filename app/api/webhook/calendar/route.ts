import { google } from 'googleapis';
import twilio from 'twilio';

export async function POST(req: Request) {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!, 
    key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  const calendar = google.calendar({ version: 'v3', auth });

  const list = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    updatedMin: new Date(Date.now() - 120000).toISOString(), // Last 2 mins
    singleEvents: true
  });

  const event = list.data.items?.[0];
  const meetLink = process.env.NEXT_PUBLIC_MEET_LINK;

  if (event?.summary?.startsWith('CONFIRMED')) {
    const phoneMatch = event.description?.match(/Phone: (\d+)/);
    if (phoneMatch) {
      const patientPhone = phoneMatch[1];
      const newTime = new Date(event.start?.dateTime || event.start?.date || Date.now()).toLocaleString('en-IN', { 
  timeZone: 'Asia/Kolkata',
  dateStyle: 'full',
  timeStyle: 'short'
});
      
      try {
        const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
        await twilioClient.messages.create({
          body: `Namaste, Dr. Dixit has rescheduled your session to ${newTime}. Same link: ${meetLink}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: `+91${patientPhone}`
        });
      } catch (e) { console.error("SMS failed", e); }
    }
  }
  return new Response('OK', { status: 200 });
}