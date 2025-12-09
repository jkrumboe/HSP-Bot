// index.js

const Volleyball_ID = 285;

function buildDateRange(startOffsetDays = -1, endOffsetDays = 8) {
  const start = new Date();
  start.setDate(start.getDate() + startOffsetDays);
  start.setHours(0, 0, 0, 0);

  const end = new Date();
  end.setDate(end.getDate() + endOffsetDays);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function buildUrl({ page = 1, limit = 50, filter }) {
  const encoded = encodeURIComponent(JSON.stringify(filter));
  return `https://backbone-web-api.production.munster.delcom.nl/bookings?s=${encoded}&limit=${limit}&page=${page}&sort=startDate,ASC`;
}

async function fetchBookingsPage({ page = 1, limit = 50, filter }) {
  const url = buildUrl({ page, limit, filter });
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });

  if (!res.ok) {
    console.error('Fehler beim Laden der Bookings:', res.status);
    console.error(await res.text());
    return [];
  }

  const data = await res.json();
  return data.data || [];
}

async function fetchBookings({ pages = 2, limit = 50, filter }) {
  const tasks = Array.from({ length: pages }, (_, idx) => fetchBookingsPage({ page: idx + 1, limit, filter }));
  const results = await Promise.all(tasks);
  return results.flat();
}

function filterActivities(activities, { descriptionIncludes = [], weekday, hour }) {
  return activities.filter(a => {
    const matchesDescription =
      descriptionIncludes.length === 0 || descriptionIncludes.some(text => a.description.includes(text));

    const date = new Date(a.startDate);
    const matchesWeekday = weekday === undefined ? true : date.getUTCDay() === weekday;
    const matchesHour = hour === undefined ? true : date.getUTCHours() === hour;

    return matchesDescription && matchesWeekday && matchesHour;
  });
}

async function searchCourses({
  linkedProductIds = [Volleyball_ID],
  startOffsetDays = -1,
  endOffsetDays = 8,
  pages = 2,
  limit = 50,
  descriptionIncludes = ["Level ", "Spielgruppe"],
  weekday, // 0=Sonntag, 1=Montag, ...
  hour,    // UTC-Stunde
  statusNot = 2 // 2 = abgesagt
} = {}) {
  const { start, end } = buildDateRange(startOffsetDays, endOffsetDays);

  const filter = {
    startDate: { "$gte": start.toISOString(), "$lte": end.toISOString() },
    linkedProductId: { "$in": linkedProductIds },
  };

  if (statusNot !== undefined) {
    filter.status = { "$ne": statusNot };
  }

  const bookings = await fetchBookings({ pages, limit, filter });
  const filtered = filterActivities(bookings, { descriptionIncludes, weekday, hour });

  return { bookings, filtered };
}

export { searchCourses, fetchBookings, buildDateRange, filterActivities };

async function main() {
  console.log("Hole Bookings...");

  const { bookings, filtered } = await searchCourses({
    linkedProductIds: [Volleyball_ID],
    descriptionIncludes: ["Level ", "Spielgruppe"],
    weekday: 1, // Montag
    hour: 20,   // 20:00 UTC
    pages: 2,
  });

  console.log(`\nGefunden: ${filtered.length} relevante Einträge (von ${bookings.length} geladen)\n`);

  for (const a of filtered) {
    console.log(`id=${a.id}, desc=${a.description}, start=${a.startDate}, avail=${a.availableParticipantCount}`);
  }
}

main();
