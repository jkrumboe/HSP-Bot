// index.js

// Volleyball-relevante Linked-Produkt-IDs
const Volleyball_ID = 285;

// Zeitspanne: gestern bis in 1,5 Wochen (8 Tage ab heute)
const START_DATE = new Date();
START_DATE.setDate(START_DATE.getDate() - 1); // gestern
START_DATE.setHours(0,0,0,0);

const END_DATE = new Date();
END_DATE.setDate(END_DATE.getDate() + 8); // 1 Woche + 1 Tag ab heute
END_DATE.setHours(23,59,59,999);

// URL dynamisch generieren
function buildUrl(page = 1, limit = 50) {
  const filter = {
    startDate: { 
      "$gte": START_DATE.toISOString(),
      "$lte": END_DATE.toISOString()
    },
    linkedProductId: { "$in": [Volleyball_ID] },
    status: { "$ne": 2 }   // nicht abgesagt
  };

  const encoded = encodeURIComponent(JSON.stringify(filter));

  return `https://backbone-web-api.production.munster.delcom.nl/bookings?s=${encoded}&limit=${limit}&page=${page}&sort=startDate,ASC`;
}


// Fetch-Funktion
async function fetchBookings(page = 1) {
  const url = buildUrl(page);

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    console.error('Fehler:', res.status);
    console.error(await res.text());
    return null;
  }

  const data = await res.json();
  return data.data || [];
}


// Logik: Volleyball Level 3 Montag 20:00
function findTargetCourses(activities) {
  return activities.filter(a => {
    const date = new Date(a.startDate);

    const weekday = date.getUTCDay();  // Montag = 1
    const hour = date.getUTCHours();   // 20 Uhr Slot

    return (
      a.description.includes("Level 3") &&
      weekday === 1 &&
      hour === 20
    );
  });
}


// MAIN
async function main() {
  console.log("Hole Bookings...");

  // page 1
  const page1 = await fetchBookings(1);
  // page 2
  const page2 = await fetchBookings(2);

  const total = [...page1, ...page2];

  // Filter nur Aktivitäten mit "Level " oder "Spielgruppe" in der Beschreibung
  const filtered = total.filter(a => 
    a.description.includes("Level ") || a.description.includes("Spielgruppe")
  );

  console.log(`\nGefunden: ${filtered.length} relevante Einträge\n`);

  for (const a of filtered) {
    console.log(
      `id=${a.id}, desc=${a.description}, start=${a.startDate}, avail=${a.availableParticipantCount}`
    );
  }

  // Filtering example:
  const target = findTargetCourses(filtered);

  console.log("\nLevel 3 Montag 20:00 Kurse:");
  console.log(target);
}

main();
