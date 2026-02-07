import { google } from 'googleapis';

export async function GET(req: Request) {
  // 1. SECURITY: Only let Vercel trigger this
  if (req.headers.get('x-vercel-cron') !== '1') {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    const calendar = google.calendar({ version: 'v3', auth });
    const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID!;

    const now = new Date();

    // 2. FETCH THE LAST 14 DAYS
    const pastSlots = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      timeMax: now.toISOString(), // Up to this exact moment
      singleEvents: true,
    });

    const items = pastSlots.data.items || [];
    console.log(`Cleaning up ${items.length} past events...`);

    for (const slot of items) {
      const summary = (slot.summary || "").toLowerCase();
      const isAvailable = summary.includes("available");
      const isPending = summary.includes("pending");
      const isConfirmed = summary.includes("confirmed");

      // DELETE past junk (Available or Pending)
      if (isAvailable || isPending) {
        await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: slot.id! });
        console.log(`Deleted: ${slot.summary}`);
      } 
      // FADE past confirmed (Color 8 is Graphite/Gray)
      else if (isConfirmed && slot.colorId !== '8') {
        await calendar.events.patch({
          calendarId: CALENDAR_ID,
          eventId: slot.id!,
          requestBody: { colorId: '8' }
        });
        console.log(`Faded: ${slot.summary}`);
      }
    }

    return new Response('Cleanup Complete', { status: 200 });
  } catch (error) {
    console.error("Cleanup Error:", error);
    return new Response('Error', { status: 500 });
  }
}