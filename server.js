// server.js - Express Server mit WebSocket für HSP-Bot GUI

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Importiere die bestehenden Module
import { getValidToken, getStoredMemberInfo, loadTokens, saveTokens, getTokenInfo, decodeToken } from './token-manager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const API_URL = 'https://backbone-web-api.production.munster.delcom.nl';
const Volleyball_ID = 285;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Aktive Polling-Jobs speichern
const activePollingJobs = new Map();

// ============ API ENDPOINTS ============

// Status-Check
app.get('/api/status', (req, res) => {
  const memberInfo = getStoredMemberInfo();
  const tokens = loadTokens();
  let tokenInfo = null;
  
  if (tokens.accessToken) {
    tokenInfo = getTokenInfo(tokens.accessToken);
  }

  res.json({
    authenticated: !!tokens.accessToken,
    member: memberInfo,
    tokenInfo: tokenInfo ? {
      email: tokenInfo.email,
      name: tokenInfo.name,
      expiresAt: tokenInfo.expiresAt,
      remainingText: tokenInfo.remainingText,
      isValid: tokenInfo.isValid
    } : null,
    activeJobs: activePollingJobs.size
  });
});

// Auth-Daten importieren
app.post('/api/auth/import', async (req, res) => {
  try {
    let authData = req.body;

    // Korrigiere doppelt escapte Strings (z.B. im userAgents-Feld)
    const jsonStr = JSON.stringify(authData);
    const fixedStr = jsonStr.replace(/\\\\/g, '\\').replace(/\\"\[/g, '[').replace(/\]\\"(,|})/g, ']$1');
    try {
      authData = JSON.parse(fixedStr);
    } catch {
      // Falls Korrektur fehlschlägt, nutze Original
    }

    if (!authData || !authData.tokenResponse || !authData.member) {
      return res.status(400).json({ error: 'Ungültige Auth-Daten. Bitte kompletten JSON-Inhalt einfügen.' });
    }

    const tokenResponse = authData.tokenResponse;
    const member = authData.member;

    // Speichere auth-data.json
    fs.writeFileSync(path.join(__dirname, 'auth-data.json'), JSON.stringify(authData, null, 2));

    // Speichere in token-store.json
    saveTokens({
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      idToken: tokenResponse.idToken,
      expiresIn: tokenResponse.expiresIn,
      memberId: member.id,
      memberEmail: member.email,
      memberName: `${member.firstName || ''} ${member.lastName || ''}`.trim()
    });

    res.json({
      success: true,
      member: {
        id: member.id,
        email: member.email,
        name: `${member.firstName || ''} ${member.lastName || ''}`.trim()
      }
    });
  } catch (error) {
    console.error('Auth-Import Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Kurse suchen
app.get('/api/courses', async (req, res) => {
  try {
    const { days = 8, level, minAvailable } = req.query;

    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setDate(end.getDate() + parseInt(days));
    end.setHours(23, 59, 59, 999);

    const filter = {
      startDate: { "$gte": start.toISOString(), "$lte": end.toISOString() },
      linkedProductId: { "$in": [Volleyball_ID] },
      status: { "$ne": 2 }
    };

    const encoded = encodeURIComponent(JSON.stringify(filter));
    const url = `${API_URL}/bookings?s=${encoded}&limit=100&page=1&sort=startDate,ASC`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`API Fehler: ${response.status}`);
    }

    const data = await response.json();
    let courses = data.data || [];

    // Level Filter
    if (level) {
      const levelInt = parseInt(level);
      courses = courses.filter(c => {
        const match = c.description?.match(/Level\s+(\d+)/i);
        return match && parseInt(match[1]) === levelInt;
      });
    }

    // Min Available Filter
    if (minAvailable) {
      const minInt = parseInt(minAvailable);
      courses = courses.filter(c => c.availableParticipantCount >= minInt);
    }

    // Fetch supervisor names
    let supervisorNames = {};
    if (courses.length > 0) {
      try {
        const bookingIds = courses.map(c => c.id).join(',');
        const supervisorUrl = `${API_URL}/bookings/query/supervisorNamesByBookingId?bookingIds=${bookingIds}`;
        const supervisorRes = await fetch(supervisorUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        if (supervisorRes.ok) {
          supervisorNames = await supervisorRes.json();
        }
      } catch (error) {
        console.error('Fehler beim Laden der Supervisor-Namen:', error);
      }
    }

    // Fetch location names from products
    let locationNames = {};
    if (courses.length > 0) {
      try {
        const productIds = [...new Set(courses.map(c => c.productId).filter(id => id))];
        if (productIds.length > 0) {
          const filter = { id: { "$in": productIds } };
          const encoded = encodeURIComponent(JSON.stringify(filter));
          const productsUrl = `${API_URL}/products?s=${encoded}`;
          const productsRes = await fetch(productsUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
          });
          if (productsRes.ok) {
            const productsData = await productsRes.json();
            productsData.data?.forEach(product => {
              locationNames[product.id] = product.description;
            });
          }
        }
      } catch (error) {
        console.error('Fehler beim Laden der Locations:', error);
      }
    }

    // Format für Frontend
    const formatted = courses.map(c => ({
      id: c.id,
      description: c.description,
      startDate: c.startDate,
      endDate: c.endDate,
      location: locationNames[c.productId] || c.location || 'Unbekannt',
      available: c.availableParticipantCount,
      maxParticipants: c.maxParticipantCount,
      status: c.status,
      supervisors: supervisorNames[c.id] || []
    }));

    res.json({ courses: formatted, total: formatted.length });
  } catch (error) {
    console.error('Kurse laden Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Einmalige Anmeldung
app.post('/api/register', async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId erforderlich' });
    }

    const token = await getValidToken();
    if (!token) {
      return res.status(401).json({ error: 'Nicht authentifiziert. Bitte Token importieren.' });
    }

    const memberInfo = getStoredMemberInfo();
    if (!memberInfo.memberId) {
      return res.status(401).json({ error: 'Keine Member-ID gefunden.' });
    }

    const payload = {
      memberId: memberInfo.memberId,
      bookingId: parseInt(bookingId),
      organizationId: null
    };

    const response = await fetch(`${API_URL}/participations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (response.status === 201) {
      // Prüfe ob Warteliste oder echte Anmeldung anhand status-Feld
      // status: 1 = Angemeldet, status: 3 = Warteliste
      const isWaitlist = responseData.status === 3;
      
      res.json({
        success: !isWaitlist,
        isWaitlist: isWaitlist,
        message: isWaitlist ? 'Auf Warteliste gesetzt' : 'Erfolgreich angemeldet!',
        participationStatus: responseData.status,
        data: responseData,
        fullResponse: responseData
      });
    } else if (response.status === 403) {
      res.json({
        success: false,
        message: responseData.message || 'Bereits angemeldet oder nicht erlaubt',
        status: 403,
        fullResponse: responseData
      });
    } else {
      res.json({
        success: false,
        message: responseData.message || 'Anmeldung fehlgeschlagen',
        status: response.status,
        fullResponse: responseData
      });
    }
  } catch (error) {
    console.error('Anmeldung Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Polling Job starten
app.post('/api/register/polling', (req, res) => {
  const { bookingId, intervalSeconds = 60, maxAttempts } = req.body;

  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId erforderlich' });
  }

  const jobId = `${bookingId}-${Date.now()}`;
  
  res.json({
    success: true,
    jobId,
    message: `Polling-Job gestartet. Verbinde via WebSocket für Updates.`
  });
});

// Polling Job stoppen
app.post('/api/register/stop', (req, res) => {
  const { jobId } = req.body;

  if (activePollingJobs.has(jobId)) {
    const job = activePollingJobs.get(jobId);
    clearInterval(job.interval);
    activePollingJobs.delete(jobId);
    res.json({ success: true, message: 'Job gestoppt' });
  } else {
    res.status(404).json({ error: 'Job nicht gefunden' });
  }
});

// Aktive Jobs abrufen
app.get('/api/jobs', (req, res) => {
  const jobs = [];
  activePollingJobs.forEach((job, id) => {
    jobs.push({
      id,
      bookingId: job.bookingId,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      intervalSeconds: job.intervalSeconds,
      startedAt: job.startedAt,
      lastAttempt: job.lastAttempt
    });
  });
  res.json({ jobs });
});

// ============ WEBSOCKET ============

wss.on('connection', (ws) => {
  console.log('🔌 WebSocket Client verbunden');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'startPolling') {
        await handlePollingStart(ws, data);
      } else if (data.type === 'stopPolling') {
        handlePollingStop(ws, data.jobId);
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket Client getrennt');
  });
});

async function handlePollingStart(ws, data) {
  const { bookingId, intervalSeconds = 1000, maxAttempts } = data;
  const jobId = `${bookingId}-${Date.now()}`;

  const token = await getValidToken();
  if (!token) {
    ws.send(JSON.stringify({ type: 'error', message: 'Nicht authentifiziert' }));
    return;
  }

  const memberInfo = getStoredMemberInfo();
  if (!memberInfo.memberId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Keine Member-ID' }));
    return;
  }

  const job = {
    bookingId,
    intervalSeconds,
    maxAttempts: maxAttempts || null,
    attempts: 0,
    startedAt: new Date().toISOString(),
    lastAttempt: null,
    ws,
    interval: null
  };

  ws.send(JSON.stringify({
    type: 'jobStarted',
    jobId,
    bookingId,
    intervalSeconds,
    maxAttempts: maxAttempts || 'unbegrenzt'
  }));

  // Ersten Versuch sofort starten
  await attemptRegistration(jobId, job, memberInfo.memberId);

  // Polling Interval
  job.interval = setInterval(async () => {
    await attemptRegistration(jobId, job, memberInfo.memberId);
  }, intervalSeconds);

  activePollingJobs.set(jobId, job);
}

async function attemptRegistration(jobId, job, memberId) {
  job.attempts++;
  job.lastAttempt = new Date().toISOString();

  const token = await getValidToken();
  if (!token) {
    job.ws.send(JSON.stringify({
      type: 'attempt',
      jobId,
      attempt: job.attempts,
      success: false,
      message: 'Token abgelaufen'
    }));
    return;
  }

  try {
    const payload = {
      memberId,
      bookingId: parseInt(job.bookingId),
      organizationId: null
    };

    const response = await fetch(`${API_URL}/participations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { message: responseText };
    }

    if (response.status === 201) {
      // Prüfe ob Warteliste oder echte Anmeldung anhand status-Feld
      // status: 1 = Angemeldet, status: 3 = Warteliste
      const isWaitlist = responseData.status === 3;

      job.ws.send(JSON.stringify({
        type: 'success',
        jobId,
        attempt: job.attempts,
        isWaitlist: isWaitlist,
        message: isWaitlist ? 'Auf Warteliste gesetzt' : 'Erfolgreich angemeldet!',
        participationStatus: responseData.status,
        data: responseData,
        fullResponse: responseData
      }));
      
      // Job nur bei echter Anmeldung beenden, bei Warteliste weiter versuchen
      if (!isWaitlist) {
        clearInterval(job.interval);
        activePollingJobs.delete(jobId);
        
        job.ws.send(JSON.stringify({
          type: 'jobCompleted',
          jobId,
          success: true,
          totalAttempts: job.attempts
        }));
      }
    } else if (response.status === 429) {
      job.ws.send(JSON.stringify({
        type: 'attempt',
        jobId,
        attempt: job.attempts,
        success: false,
        rateLimited: true,
        message: 'Rate-Limit erreicht, warte...'
      }));
    } else {
      job.ws.send(JSON.stringify({
        type: 'attempt',
        jobId,
        attempt: job.attempts,
        success: false,
        status: response.status,
        message: responseData.message || 'Anmeldung fehlgeschlagen'
      }));
    }

    // Max Attempts Check
    if (job.maxAttempts && job.attempts >= job.maxAttempts) {
      clearInterval(job.interval);
      activePollingJobs.delete(jobId);
      
      job.ws.send(JSON.stringify({
        type: 'jobCompleted',
        jobId,
        success: false,
        message: `Max. Versuche (${job.maxAttempts}) erreicht`,
        totalAttempts: job.attempts
      }));
    }
  } catch (error) {
    job.ws.send(JSON.stringify({
      type: 'attempt',
      jobId,
      attempt: job.attempts,
      success: false,
      message: error.message
    }));
  }
}

function handlePollingStop(ws, jobId) {
  if (activePollingJobs.has(jobId)) {
    const job = activePollingJobs.get(jobId);
    clearInterval(job.interval);
    activePollingJobs.delete(jobId);
    
    ws.send(JSON.stringify({
      type: 'jobStopped',
      jobId,
      totalAttempts: job.attempts
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Job nicht gefunden'
    }));
  }
}

// Server starten
server.listen(PORT, () => {
  console.log(`\n🚀 HSP-Bot GUI Server läuft auf http://localhost:${PORT}`);
  console.log(`📡 WebSocket bereit für Live-Updates\n`);
});
