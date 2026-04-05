import { getGoogleAccessToken } from "./google-auth";

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  calendar: string;
  location?: string;
  hangoutLink?: string;
}

async function listAllCalendars(): Promise<{ id: string; summary: string }[]> {
  const token = await getGoogleAccessToken();
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  return (data.items || []).map((c: { id: string; summary?: string }) => ({
    id: c.id,
    summary: c.summary || c.id,
  }));
}

export async function listEventsAllCalendars(opts: {
  timeMin?: string;
  timeMax?: string;
}): Promise<CalendarEvent[]> {
  const token = await getGoogleAccessToken();
  const now = new Date();
  const timeMin = opts.timeMin || now.toISOString();
  const timeMax =
    opts.timeMax || new Date(now.getTime() + 7 * 86400000).toISOString();

  const calendars = await listAllCalendars();

  const allEvents = await Promise.all(
    calendars.map(async (cal) => {
      const url =
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?` +
        `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
        `&singleEvents=true&orderBy=startTime&maxResults=50`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      return (data.items || []).map(
        (e: {
          id: string;
          summary?: string;
          start?: { dateTime?: string; date?: string };
          end?: { dateTime?: string; date?: string };
          location?: string;
          hangoutLink?: string;
        }) => ({
          id: e.id,
          summary: e.summary || "(sans titre)",
          start: e.start?.dateTime || e.start?.date || "",
          end: e.end?.dateTime || e.end?.date || "",
          calendar: cal.summary,
          location: e.location,
          hangoutLink: e.hangoutLink,
        })
      );
    })
  );

  return allEvents
    .flat()
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}
