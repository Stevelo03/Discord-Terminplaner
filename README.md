# Terminplanungsbot 📅

Ein leistungsstarker Discord-Bot zur effizienten Terminplanung auf Discord-Servern. Oder so. 
Eigentlich habe ich diesen Bot entwickelt weil ich in meinem Freundeskreis das Problem hatte das Terminabsprachen immer erst auf den letzten Drücker entstanden, und keiner genau wusste wer denn jetzt wann kommt.

## Features ✨

### Hauptfunktionen
- **Terminplanung**: Erstellen Sie Termine mit voller Kontrolle über Datum, Uhrzeit und Teilnehmer
- **Automatische Einladungen**: Bot sendet automatische Einladungen an alle genannten Teilnehmer per DM
- **Interaktive Teilnahme**: Nutzer können direkt über Buttons zusagen, absagen oder alternative Zeiten vorschlagen
- **Live-Statusübersicht**: Echtzeit-Aktualisierung der Teilnehmerstatus im Server-Channel
- **Intelligente Abbruchfunktion**: Terminabbruch mit optionalem Grund und automatischen Benachrichtigungen

### Erweiterte Features
- **Rollenunterstützung**: Lade ganze Teams durch Erwähnung einer Rolle ein
- **Terminverwaltung**: Füge nachträglich Teilnehmer hinzu oder entferne sie
- **Discord Zeitstempel**: Unterstützung für relative und absolute Discord-Zeitangaben (zeigt die Zeit in jeder Zeitzone korrekt an)
- **Flexible Zusage-Optionen**: Verschiedene Antwortmöglichkeiten für unterschiedliche Teilnahme-Szenarien
- **Alternative Uhrzeiten**: Teilnehmer können alternative Zeiten vorschlagen, wenn der Haupttermin nicht passt
- **Erweiterte Abbruchfunktion**: 
  - Optionale Begründung für Terminabbrüche
  - Automatische DM-Benachrichtigungen an zugesagte Teilnehmer
  - Visuelle Kennzeichnung durch rote Embed-Farbe
- **Erinnerungssystem**: 
  - Senden Sie Erinnerungen an Teilnehmer, die noch nicht geantwortet haben
  - Spezielle Starterinnerung kurz vor Terminbeginn an alle zugesagten Teilnehmer
- **Multi-Server Support**: Funktioniert auf beliebig vielen Discord-Servern gleichzeitig
- **Automatische Befehlsregistrierung**: Registriert sich automatisch auf neuen Servern

### Visuelle Kennzeichnung
- **🔵 Blaue Embeds**: Aktive Terminsuchen
- **🟢 Grüne Embeds**: Geschlossene Terminsuchen
- **🔴 Rote Embeds**: Abgebrochene Terminsuchen

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

## Befehle 💬

### `/termin`
Erstellt eine neue Terminsuche mit folgenden Parametern:
- **Pflichtfelder**:
  - `titel`: Name des Events (z.B. "ARMA 3 Session")
  - `datum`: Datum des Events (normale Angabe oder Discord-Zeitstempel)
  - `uhrzeit`: Uhrzeit des Events
  - `teilnehmer`: Liste von Teilnehmern oder Rollen (@user1, @rolle1)
- **Optionale Felder**:
  - `relatives_datum`: Discord-Zeitstempel für relative Anzeige
  - `kommentar`: Zusätzliche Informationen zum Termin

### `/adduser`
Fügt Teilnehmer zu einer bestehenden Terminsuche hinzu:
- `eventid`: Die Event-ID der Terminsuche (aus dem Footer der Nachricht)
- `teilnehmer`: Zu hinzufügende Teilnehmer oder Rollen (@user1, @rolle1)

### `/removeuser`
Entfernt Teilnehmer aus einer bestehenden Terminsuche:
- `eventid`: Die Event-ID der Terminsuche (aus dem Footer der Nachricht)
- `teilnehmer`: Zu entfernende Teilnehmer oder Rollen (@user1, @rolle1)

### `/help`
Zeigt eine umfassende Hilfenachricht mit allen Funktionen und Features

## Admin-Features ⚙️

Nur Server-Administratoren können:
- Termine erstellen und verwalten
- Teilnehmer hinzufügen oder entfernen
- Erinnerungen an ausstehende Teilnehmer senden
- Starterinnerungen kurz vor Terminbeginn versenden
- **Terminsuchen intelligent abbrechen** mit erweiterten Optionen:
  - Optionale Begründung eingeben (wird im Status und bei Antwortversuchen angezeigt)
  - Auswahl, ob zugesagte Teilnehmer automatisch per DM benachrichtigt werden sollen
  - Statistiken über erfolgreich versendete Benachrichtigungen
- Terminsuchen schließen

## Teilnehmer-Optionen 👥

Teilnehmer können aus fünf verschiedenen Antwortmöglichkeiten wählen:
- **Zusagen**: Bestätigt die Teilnahme zur angegebenen Zeit
- **Zusagen mit Vorbehalt**: Teilnahme mit gewissen Vorbehalten oder Unsicherheiten
- **Zusagen ohne Uhrzeitgarantie**: Teilnahme wahrscheinlich, aber pünktliches Erscheinen nicht garantiert
- **Alternative Uhrzeit vorschlagen**: Andere präferierte Zeit angeben
- **Absagen**: Teilnahme ablehnen

## Abbruchfunktion im Detail 🚨

### Für Administratoren
Beim Klick auf "Terminsuche abbrechen" öffnet sich ein Modal mit zwei Optionen:

1. **Abbruchgrund** (optional):
   - Bis zu 200 Zeichen
   - Wird im Server-Embed Footer angezeigt: `Status: Abgebrochen (Grund)`
   - Erscheint bei Antwortversuchen: `Diese Terminsuche wurde abgebrochen. Grund: [Grund]`

2. **Benachrichtigung** (Pflichtfeld):
   - `0` = Keine DM-Benachrichtigungen
   - `1` = Alle Teilnehmer mit Zusagen erhalten eine DM über den Abbruch

### Automatische Funktionen
- **Visuelle Kennzeichnung**: Das Server-Embed wird automatisch rot eingefärbt
- **DM-Benachrichtigungen**: Zugesagte Teilnehmer erhalten eine professionelle Abbruch-Nachricht
- **Statistiken**: Der Admin erhält eine Übersicht über erfolgreich versendete Benachrichtigungen
- **Transparenz**: Abbruchgrund ist für alle sichtbar und nachvollziehbar

### Für Teilnehmer
- Bei Antwortversuchen auf abgebrochene Termine wird der Abbruchgrund angezeigt
- Optionale DM-Benachrichtigung mit allen relevanten Informationen
- Keine weiteren Interaktionen mit dem abgebrochenen Termin möglich

## Technische Details 💻

- Entwickelt in TypeScript
- Basiert auf discord.js v14
- Lokale Datenspeicherung (keine externe Datenbank benötigt)
- Automatische Error-Behandlung
- Ephemeral Nachrichten für saubere Channelinteraktion
- Dynamische Embed-Farbgebung basierend auf Event-Status
- Robuste Modal-Verarbeitung mit Eingabevalidierung

## Datensicherheit 🔒

- Alle Daten werden lokal gespeichert
- Keine Weitergabe an Dritte
- Alle Kommunikation erfolgt über die offizielle Discord API
- Abbruchgründe werden nur intern gespeichert und sind nur für Teilnehmer des jeweiligen Events sichtbar


## Lizenz 📜

AGPL-3.0 Lizenz - siehe LICENSE Datei für Details
sowie ATTRIBUTION Datei für Details

---
