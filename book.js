// book.js - Script zum Buchen eines verfügbaren Volleyball Kurses

const Volleyball_ID = 285;

// WICHTIG: Dein Auth Token und Member ID hier einfügen
const AUTH_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6Imp1c3Rpbi5rcnVtYm9laG1lckB1bmktbXVlbnN0ZXIuZGUiLCJmaXJzdE5hbWUiOiJKdXN0aW4iLCJtaWRkbGVOYW1lIjpudWxsLCJsYXN0TmFtZSI6IktydW1iw7ZobWVyIiwibGFuZ3VhZ2UiOiJkZSIsInN1YiI6MTQ0MSwidG9rZW5UeXBlIjoidXNlciIsImlhdCI6MTc2NTI4NTgwNSwiZXhwIjoxNzY1ODg1ODA1fQ.iJUuCRveVmhN3RSqRFmU--OFSuNRjyyjbVomunuQxW4";
const MEMBER_ID = 1441;

// Zeitspanne: heute
const START_DATE = new Date();
START_DATE.setHours(0,0,0,0);

const END_DATE = new Date();
END_DATE.setHours(23,59,59,999);

// Fetch Bookings
async function fetchBookings() {
  const filter = {
    startDate: { 
      "$gte": START_DATE.toISOString(),
      "$lte": END_DATE.toISOString()
    },
    linkedProductId: { "$in": [Volleyball_ID] },
    status: { "$ne": 2 }
  };

  const encoded = encodeURIComponent(JSON.stringify(filter));
  const url = `https://backbone-web-api.production.munster.delcom.nl/bookings?s=${encoded}&limit=50&page=1&sort=startDate,ASC`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data || [];
}

// Buche einen Kurs
async function bookCourse(booking) {
  const payload = {
    organizationId: null,
    memberId: MEMBER_ID,
    bookingId: booking.id,
    primaryPurchaseMessage: null,
    secondaryPurchaseMessage: null,
    params: {
      startDate: booking.startDate,
      endDate: booking.endDate,
      bookableProductId: booking.productId,
      bookableLinkedProductId: booking.linkedProductId,
      bookingId: booking.id,
      invitedMemberEmails: [],
      invitedGuests: [],
      invitedOthers: [],
      primaryPurchaseMessage: null,
      secondaryPurchaseMessage: null,
      clickedOnBook: true
    },
    dateOfRegistration: null
  };

  const url = "https://backbone-web-api.production.munster.delcom.nl/participations";

  console.log("\n📤 Sende Buchungsanfrage...");
  console.log("Payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AUTH_TOKEN}`,
      'x-custom-lang': 'de',
      'x-platform': 'CF',
      'x-user-role-id': '1539'
    },
    body: JSON.stringify(payload)
  });

  console.log(`\n📥 Response Status: ${res.status} ${res.statusText}`);
  
  const responseText = await res.text();
  console.log("Response Body:", responseText);

  if (!res.ok) {
    throw new Error(`Booking failed: ${res.status} - ${responseText}`);
  }

  return JSON.parse(responseText);
}

// Main
async function main() {
  try {
    console.log("🔍 Suche verfügbare Kurse für heute...\n");

    const bookings = await fetchBookings();
    
    // Filter: Level 2 oder Level 3, verfügbar
    const available = bookings.filter(b => {
      const hasLevel = b.description.includes("Level 2") || b.description.includes("Level 3");
      const isAvailable = b.availableParticipantCount > 0;
      return hasLevel && isAvailable;
    });

    if (available.length === 0) {
      console.log("❌ Keine verfügbaren Level 2 oder Level 3 Kurse heute gefunden.");
      return;
    }

    console.log(`✅ Gefunden: ${available.length} verfügbare Kurse:\n`);
    available.forEach((b, i) => {
      console.log(`${i + 1}. ID ${b.id} - ${b.description}`);
      console.log(`   Start: ${b.startDate}`);
      console.log(`   Verfügbar: ${b.availableParticipantCount} Plätze\n`);
    });

    // Buche den ersten verfügbaren Kurs
    const target = available[0];
    console.log(`\n🎯 Versuche zu buchen: ${target.description} (ID ${target.id})`);

    const result = await bookCourse(target);

    console.log("\n✅ ERFOLGREICH GEBUCHT!");
    console.log("Booking Details:", JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("\n❌ Fehler:", error.message);
    console.error(error);
  }
}

main();
