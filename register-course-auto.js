// register-course-auto.js
// Automatisierte Kursanmeldung mit Token-Management und Polling

import { getValidToken, getStoredMemberInfo } from './token-manager.js';

const API_URL = 'https://backbone-web-api.production.munster.delcom.nl/participations';

// Rate-Limiting Tracking
const rateLimitStats = {
  totalRequests: 0,
  successfulRegistrations: 0,
  alreadyRegistered: 0,
  rateLimitHits: 0,
  errors: 0,
  startTime: null,
  requestTimes: [] // Für Analyse von Request-Abständen
};

/**
 * Meldet sich automatisch für einen Kurs an
 */
async function registerCourse(memberId, bookingId) {
  // Hole einen gültigen Token (erneuert ihn bei Bedarf)
  const token = await getValidToken();
  
  if (!token) {
    console.error('❌ Konnte keinen gültigen Token besorgen');
    return null;
  }

  const storedMember = getStoredMemberInfo();
  const effectiveMemberId = memberId ?? storedMember.memberId;

  if (!effectiveMemberId) {
    console.error('❌ Keine memberId gefunden. Bitte auth-data importieren oder memberId angeben.');
    return null;
  }

  const payload = {
    memberId: effectiveMemberId,
    bookingId,
    organizationId: null
  };

  console.log('\n📤 Sende Anmeldung:');
  console.log('================');
  console.log('Member ID:', effectiveMemberId);
  console.log('Booking ID:', bookingId);
  console.log('Zeitstempel:', new Date().toLocaleString('de-DE'));

  const requestTime = Date.now();
  rateLimitStats.requestTimes.push(requestTime);
  rateLimitStats.totalRequests++;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    console.log('Status:', res.status);
    
    // Prüfe auf Rate-Limiting Indikatoren
    let isRateLimited = false;
    if (res.status === 429) {
      isRateLimited = true;
      rateLimitStats.rateLimitHits++;
      console.log('⚠️  RATE-LIMIT ERKANNT (429)');
      const retryAfter = res.headers.get('Retry-After');
      if (retryAfter) {
        console.log('Retry-After Header:', retryAfter, 'Sekunden');
      }
    }

    if (res.status === 201) {
      // Prüfe ob Warteliste oder echte Anmeldung anhand status-Feld
      // status: 1 = Angemeldet, status: 3 = Warteliste
      const isWaitlist = responseData.status === 3;
      
      if (isWaitlist) {
        console.log('⚠️  Auf Warteliste gesetzt!');
        console.log('- Participation ID:', responseData.id);
        console.log('- Status:', responseData.status);
      } else {
        console.log('✅ Erfolgreich angemeldet!');
        console.log('- Participation ID:', responseData.id);
        console.log('- Claim Code:', responseData.claimCode);
        console.log('- Status:', responseData.status);
        rateLimitStats.successfulRegistrations++;
      }
      console.log('\n📄 Server-Antwort:', JSON.stringify(responseData));
      return { success: !isWaitlist, isWaitlist, data: responseData };
    } else if (res.status === 403) {
      const errorMsg = responseData.message || 'Bereits angemeldet';
      console.log('⚠️ ', errorMsg);
      rateLimitStats.alreadyRegistered++;
      return { success: false, status: 403, message: errorMsg };
    } else if (isRateLimited) {
      console.log('❌ Fehler:', responseData.message || responseData);
      return { success: false, status: res.status, rateLimited: true, data: responseData };
    } else {
      console.log('❌ Fehler:', responseData.message || responseData);
      rateLimitStats.errors++;
      return { success: false, status: res.status, data: responseData };
    }
  } catch (error) {
    console.error('❌ Fehler bei der Anmeldung:', error.message);
    rateLimitStats.errors++;
    return { success: false, error: error.message };
  }
}

/**
 * Regelmäßige Anmeldungsversuche mit konfigurierbarem Intervall
 */
async function registerCoursePolling(memberId, bookingId, intervalMiliSeconds = 1000, maxAttempts = null) {
  console.log('\n🤖 Starte Polling-Anmeldung');
  console.log('===========================');
  console.log('Member ID:', memberId);
  console.log('Booking ID:', bookingId);
  console.log('Intervall:', intervalMiliSeconds / 1000, 'Sekunden');
  if (maxAttempts) {
    console.log('Max. Versuche:', maxAttempts);
  } else {
    console.log('Läuft unbegrenzt (Ctrl+C zum Stoppen)');
  }
  console.log('Start:', new Date().toLocaleString('de-DE'));
  console.log('===========================\n');

  rateLimitStats.startTime = Date.now();

  let attempt = 0;
  
  return new Promise((resolve) => {
    const pollInterval = setInterval(async () => {
      attempt++;
      
      console.log(`\n[Versuch ${attempt}] ${new Date().toLocaleString('de-DE')}`);
      
      const result = await registerCourse(memberId, bookingId);
      
      // Wenn erfolgreich angemeldet, stoppe Polling
      if (result && result.success) {
        clearInterval(pollInterval);
        // Zeige Statistiken nur wenn unbegrenzt (kein maxAttempts)
        if (!maxAttempts) {
          printRateLimitStats();
        }
        resolve(result);
        return;
      }

      // Wenn Rate-Limit erreicht, warnte und fahre fort
      if (result && result.rateLimited) {
        console.log('⏰ Warte...');
      }

      // Wenn Max. Versuche erreicht, stoppe
      if (maxAttempts && attempt >= maxAttempts) {
        console.log(`\n⏹️  Max. Versuche (${maxAttempts}) erreicht. Beende Polling.`);
        clearInterval(pollInterval);
        // Zeige Statistiken NUR wenn unbegrenzt (kein maxAttempts)
        if (!maxAttempts) {
          printRateLimitStats();
        }
        resolve(null);
      }
    }, intervalMiliSeconds);

    // Ermögliche manuelles Stoppen mit Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n\n⏹️  Polling beendet durch Benutzer');
      clearInterval(pollInterval);
      // Zeige Statistiken NUR wenn unbegrenzt (kein maxAttempts)
      if (!maxAttempts) {
        printRateLimitStats();
      }
      process.exit(0);
    });
  });
}

/**
 * Batch-Anmeldung für mehrere Kurse
 */
async function registerMultipleCourses(memberId, bookingIds) {
  console.log('🚀 Starte Batch-Anmeldung');
  console.log('========================\n');
  
  const results = [];
  
  for (const bookingId of bookingIds) {
    const result = await registerCourse(memberId, bookingId);
    results.push({ bookingId, ...result });
    
    // Warte zwischen Anfragen
    if (bookingIds.indexOf(bookingId) < bookingIds.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log('\n\n📊 Zusammenfassung:');
  console.log('==================');
  results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌';
    console.log(`${index + 1}. Booking ${result.bookingId}: ${status}`);
  });

  return results;
}

/**
 * Gibt Rate-Limit Statistiken aus
 */
function printRateLimitStats() {
  console.log('\n\n📊 Rate-Limit Statistiken:');
  console.log('==========================');
  console.log('Gesamt Requests:', rateLimitStats.totalRequests);
  console.log('Erfolgreiche Anmeldungen:', rateLimitStats.successfulRegistrations);
  console.log('Bereits angemeldet:', rateLimitStats.alreadyRegistered);
  console.log('Rate-Limit Hits (429):', rateLimitStats.rateLimitHits);
  console.log('Andere Fehler:', rateLimitStats.errors);

  if (rateLimitStats.requestTimes.length > 1) {
    const timeIntervals = [];
    for (let i = 1; i < rateLimitStats.requestTimes.length; i++) {
      timeIntervals.push(rateLimitStats.requestTimes[i] - rateLimitStats.requestTimes[i - 1]);
    }
    
    const avgInterval = Math.round(timeIntervals.reduce((a, b) => a + b, 0) / timeIntervals.length);
    const minInterval = Math.min(...timeIntervals);
    const maxInterval = Math.max(...timeIntervals);

    console.log('\n⏱️  Request-Abstände:');
    console.log('  Durchschnitt:', (avgInterval / 1000).toFixed(2), 'Sekunden');
    console.log('  Minimum:', (minInterval / 1000).toFixed(2), 'Sekunden');
    console.log('  Maximum:', (maxInterval / 1000).toFixed(2), 'Sekunden');
  }

  if (rateLimitStats.startTime) {
    const duration = (Date.now() - rateLimitStats.startTime) / 1000;
    console.log('\n⏱️  Gesamtdauer:', Math.floor(duration), 'Sekunden');
    console.log('Requests pro Minute:', (rateLimitStats.totalRequests / (duration / 60)).toFixed(2));
  }

  console.log('\n');
}

// Exportiere Funktionen
export { 
  registerCourse, 
  registerMultipleCourses,
  registerCoursePolling,
  rateLimitStats,
  printRateLimitStats
};

// Kommandozeilen-Verarbeitung
const args = process.argv.slice(2);

if (args.length > 0) {
  // Optionales memberId: Wenn nur ein Argument, ist es bookingId
  let memberId = null;
  let bookingId = null;
  let intervalStr = null;
  let maxAttemptsStr = null;

  if (args.length === 1) {
    bookingId = args[0];
  } else {
    memberId = args[0];
    bookingId = args[1];
    intervalStr = args[2];
    maxAttemptsStr = args[3];
  }
  
  if (!bookingId) {
    console.log('Fehler: bookingId erforderlich');
    console.log('Verwendung: node register-course-auto.js [memberId] <bookingId> [intervalSeconds] [maxAttempts]');
    process.exit(1);
  }

  const interval = intervalStr ? parseInt(intervalStr) : null;
  const maxAttempts = maxAttemptsStr ? parseInt(maxAttemptsStr) : null;

  if (interval) {
    // Polling-Modus - Intervall ist in Millisekunden
    registerCoursePolling(
      memberId ? parseInt(memberId) : null, 
      parseInt(bookingId), 
      interval,  // Bereits in Millisekunden
      maxAttempts
    ).catch(console.error);
  } else {
    // Einzelner Versuch
    registerCourse(memberId ? parseInt(memberId) : null, parseInt(bookingId))
      .then(() => {
        printRateLimitStats();
        process.exit(0);
      })
      .catch(console.error);
  }
} else {
  console.log('📝 Verwendung:');
  console.log('==============');
  console.log('\n1. Einzelne Anmeldung (memberId optional, wird sonst aus token-store/auth-data genommen):');
  console.log('   node register-course-auto.js [memberId] <bookingId>');
  console.log('   Beispiel: node register-course-auto.js 36432\n');
  
  console.log('2. Regelmäßige Anmeldungsversuche (Polling):');
  console.log('   node register-course-auto.js [memberId] <bookingId> <intervalMs> [maxAttempts]');
  console.log('   Beispiel: node register-course-auto.js 36432 1000');
  console.log('   → Versucht alle 1000ms (1 Sekunde) zu buchen\n');
  
  console.log('3. Mit Limit der Versuche:');
  console.log('   node register-course-auto.js 36432 500 20');
  console.log('   → Versucht alle 500ms, max. 20 Versuche\n');
}

