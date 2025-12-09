# 🚀 HSP-Bot - Kursanmeldungs-Automation & Rate-Limit Testing

Ein automatisiertes System zur Anmeldung in Hochschulsport-Kursen mit Token-Management und Rate-Limit-Testing.

## ✨ Features

- ✅ **Automatische Authentifizierung** - Tokens werden verwaltet und automatisch erneuert
- ✅ **Polling-System** - Regelmäßige Anmeldungsversuche mit konfigurierbarem Intervall
- ✅ **Batch-Verarbeitung** - Mehrere Kurse gleichzeitig anmelden
- ✅ **Web-GUI** - Interaktive Oberfläche mit Live-Feedback

## 📦 Installation

```bash
# Repository klonen (falls noch nicht geschehen)
git clone https://github.com/RobinGummels/HSP-Bot.git
cd HSP-Bot

# Abhängigkeiten installieren
npm install
```

## 🔑 Token einmalig importieren

```bash
# 1. Öffne die HSP-Website im Browser
# 2. Öffne Developer Tools (F12) → Console
# 3. Führe aus: localStorage.getItem("delcom_auth")
# 4. Kopiere die komplette Ausgabe
# 5. Speichere als "auth-data.json" im HSP-Bot Ordner

# Dann importieren:
node import-token.js
```

Danach wird der Token automatisch in `token-store.json` gespeichert.

## 🖥️ Web-GUI (Empfohlen)

Die einfachste Art, den HSP-Bot zu nutzen:

```bash
# Server starten
npm run server
# oder
node server.js
```

Dann öffne **http://localhost:3000** im Browser.

### GUI-Features

| Feature | Beschreibung |
|---------|--------------|
| 🔍 **Kurssuche** | Filtere nach Level, Zeitraum und freien Plätzen |
| 🎯 **Schnellanmeldung** | Ein Klick auf "Anmelden" für sofortige Buchung |
| 🔄 **Polling** | Wiederholte Versuche mit Live-Status-Updates |
| 🔑 **Auth-Import** | Token direkt im Browser einfügen |
| 📊 **Live-Feedback** | WebSocket-basierte Echtzeit-Updates |

### Auth-Daten über GUI importieren

1. Öffne http://localhost:3000
2. Klicke auf den Tab **"🔑 Auth-Daten"**
3. Folge der Anleitung zum Kopieren der Daten aus dem Browser
4. Füge die Daten ein und klicke "Importieren"

## 🎯 Schnelle Start-Befehle (Terminal)

### 1️⃣ Kurse suchen

```bash
# Alle Volleyball-Kurse der nächsten 8 Tage
node searchCourses.js

# Nur Level 3 Kurse
node searchCourses.js --level 3

# Kurse mit mindestens 5 freien Plätzen
node searchCourses.js --min-available 5

# Level 2 in den nächsten 14 Tagen mit mindestens 3 freien Plätzen
node searchCourses.js --level 2 --days 14 --min-available 3

# Hilfe anzeigen
node searchCourses.js --help
```

### 2️⃣ Einzelne Anmeldung (memberId wird automatisch aus Token/`auth-data.json` geladen)
```bash
node register-course-auto.js 36432
```

### 3️⃣ Polling mit 60 Sekunden Intervall
```bash
node register-course-auto.js 36432 60
```

### 4️⃣ Polling mit Limit (30s, max. 20 Versuche)
```bash
node register-course-auto.js 36432 30 20
```

## 📊 Verwendete Skripte

| Skript | Beschreibung | Verwendung |
|--------|---|---|
| `server.js` | Web-GUI Server | `npm run server` oder `node server.js` |
| `searchCourses.js` | Kurssuche mit Filtern | `node searchCourses.js [--level LEVEL] [--min-available COUNT] [--days DAYS]` |
| `register-course-auto.js` | Produktive Anmeldung + Polling | `node register-course-auto.js [memberId] <bookingId> [intervalSeconds] [maxAttempts]` |
| `token-manager.js` | Token-Verwaltung & Renewal | Import nur, nicht direkt aufrufen |
| `import-token.js` | Browser-Token Importer | `node import-token.js` |

## 🔐 Sicherheit

- **Token-Dateien werden NICHT committed** (in `.gitignore`)
- Token-Refresh erfolgt automatisch basierend auf Gültigkeit
- Refresh-Token wird sicher lokal gespeichert
- Keine Passwörter im Code

## 📝 Konfiguration

### Kurssuche mit `searchCourses.js`

Die Kurssuche ist das erste Werkzeug, um passende Kurse zu finden:

**Filter-Optionen:**
- `--level LEVEL` - Nach Niveau filtern (z.B. 1, 2, 3)
- `--min-available COUNT` - Nur Kurse mit mindestens COUNT freien Plätzen
- `--days DAYS` - Zeitraum in Tagen (Standard: 8)

**Beispiel-Workflow:**
```bash
# 1. Alle verfügbaren Kurse anschauen
node searchCourses.js

# 2. Nur Level 3 Kurse mit freien Plätzen
node searchCourses.js --level 3 --min-available 1

# 3. BookingId aus der Ausgabe kopieren und Anmeldung starten
node register-course-auto.js 36432 60
```

### Member ID/Booking ID setzen

- Standard: `memberId` wird automatisch aus `token-store.json` bzw. `auth-data.json` verwendet.
- Optional kannst du eine andere `memberId` als erstes Argument angeben.

```bash
# Booking ID 12345 mit gespeicherter memberId
node register-course-auto.js 12345

# Booking ID 12345 mit expliziter memberId 999
node register-course-auto.js 999 12345 60
```

### API Endpoints

Hauptendpoint ist:
```
https://backbone-web-api.production.munster.delcom.nl/participations
```

Token-Refresh:
```
https://backbone-web-api.production.munster.delcom.nl/auth/refresh
```

## 🐛 Troubleshooting

### "Konnte keinen gültigen Token besorgen"
- Token ist abgelaufen
- Refresh-Token ist ungültig
- **Lösung**: `node import-token.js` erneut durchführen

### "File not found: token-store.json"
- Du hast noch keinen Token importiert
- **Lösung**: `node import-token.js` ausführen

### Polling stoppt nicht
- Drücke Ctrl+C um zu beenden
- Oder setze maxAttempts-Limit
- Mit `> output.log` kannst du Logs speichern

## 👤 Autor

Justin Krumböhmer und Robin Gummels

---

**Hinweis**: Verwende dieses Tool verantwortungsvoll. Respektiere die Server und deren Rate-Limits! 🙏
