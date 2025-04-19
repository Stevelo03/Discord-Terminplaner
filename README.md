# Terminplanungsbot 📅

Ein leistungsstarker Discord-Bot zur effizienten Terminplanung auf Discord-Servern. Oder so. 
Eigentlich habe ich diesen Bot entwickelt weil ich in meinem Freundeskreis das Problem hatte das Terminabsprachen immer erst auf den letzten Drücker entstanden, und keiner genau wusste wer denn jetzt wann kommt.

## Features ✨

### Hauptfunktionen
- **Terminplanung**: Erstellen Sie Termine mit voller Kontrolle über Datum, Uhrzeit und Teilnehmer
- **Automatische Einladungen**: Bot sendet automatische Einladungen an alle genannten Teilnehmer per DM
- **Interaktive Teilnahme**: Nutzer können direkt über Buttons zusagen, absagen oder alternative Zeiten vorschlagen
- **Live-Statusübersicht**: Echtzeit-Aktualisierung der Teilnehmerstatus im Server-Channel

### Erweiterte Features
- **Discord Zeitstempel**: Unterstützung für relative und absolute Discord-Zeitangaben (zeigt die Zeit in jeder Zeitzone korrekt an)
- **Alternative Uhrzeiten**: Teilnehmer können alternative Zeiten vorschlagen, wenn der Haupttermin nicht passt
- **Erinnerungssystem**: 
  - Senden Sie Erinnerungen an Teilnehmer, die noch nicht geantwortet haben
  - Spezielle Starterinnerung kurz vor Terminbeginn
- **Multi-Server Support**: Funktioniert auf beliebig vielen Discord-Servern gleichzeitig
- **Automatische Befehlsregistrierung**: Registriert sich automatisch auf neuen Servern

## Installation 🛠️

### Voraussetzungen
- Node.js (Version 16+)
- NPM oder Yarn
- Ein Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))

### Schritt-für-Schritt Anleitung

1. Repository klonen
```bash
git clone https://github.com/Stevelo03/Discord-Terminplaner
```

2. Dependencies installieren
```bash
npm install
```

3. `.env` Datei erstellen
```env
BOT_TOKEN=dein_discord_bot_token
CLIENT_ID=deine_client_id
```

4. Bot starten
```bash
npm run build
npm start
```

### Produktivbetrieb mit PM2
```bash
npm install -g pm2
pm2 start npm --name "terminbot" -- start
pm2 startup
pm2 save
```

## Befehle 💬

### `/termin`
Erstellt eine neue Terminsuche mit folgenden Parametern:
- **Pflichtfelder**:
  - `titel`: Name des Events (z.B. "ARMA 3 Session")
  - `datum`: Datum des Events (normale Angabe oder Discord-Zeitstempel)
  - `uhrzeit`: Uhrzeit des Events
  - `teilnehmer`: Liste von Teilnehmern (@mention)
- **Optionale Felder**:
  - `relatives_datum`: Discord-Zeitstempel für relative Anzeige
  - `kommentar`: Zusätzliche Informationen zum Termin

### `/terminbot-hilfe`
Zeigt eine umfassende Hilfenachricht mit allen Funktionen und Features

## Admin-Features ⚙️

Nur Server-Administratoren können:
- Termine erstellen und verwalten
- Erinnerungen an ausstehende Teilnehmer senden
- Starterinnerungen kurz vor Terminbeginn versenden
- Terminsuchen abbrechen oder schließen

## Teilnehmer-Optionen 👥

Teilnehmer können:
- **Zusagen**: Bestätigt die Teilnahme zur angegebenen Zeit
- **Zusagen ohne Uhrzeitgarantie**: Teilnahme wahrscheinlich, Zeit noch nicht sicher
- **Alternative Uhrzeit vorschlagen**: Andere präferierte Zeit angeben
- **Absagen**: Teilnahme ablehnen

## Technische Details 💻

- Entwickelt in TypeScript
- Basiert auf discord.js v14
- Lokale Datenspeicherung (keine externe Datenbank benötigt)
- Automatische Error-Behandlung
- Ephemeral Nachrichten für saubere Channelinteraktion

## Datensicherheit 🔒

- Alle Daten werden lokal gespeichert
- Keine Weitergabe an Dritte
- Alle Kommunikation erfolgt über die offizielle Discord API

## Lizenz 📜

AGPL-3.0 Lizenz - siehe LICENSE Datei für Details

---
