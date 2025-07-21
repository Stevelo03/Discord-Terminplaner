// src/commands/help.ts
import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Zeigt Hilfe für den Terminplanungsbot an'),
  
  async execute(interaction: CommandInteraction) {
    const helpEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Terminplanungsbot - Hilfe')
      .setDescription('Dieser Bot hilft bei der Planung von Terminen für deine Discord-Server.')
      .addFields(
        { 
          name: '/termin', 
          value: 'Erstellt eine neue Terminsuche und lädt Teilnehmer ein' 
        },
        { 
          name: 'Parameter für /termin', 
          value: '**Pflichtfelder:**\n' +
            '- `titel`: Name des Events (z.B. "ARMA 3")\n' +
            '- `datum`: Datum des Events (z.B. "25.04.2025" oder Discord-Zeitstempel "<t:1744819440:D>")\n' +
            '- `uhrzeit`: Uhrzeit des Events (z.B. "20:00")\n' +
            '- `teilnehmer`: Liste von Nutzern oder Rollen (z.B. "@Nutzer1 @TeamRolle")\n\n' +
            '**Optionale Felder:**\n' +
            '- `relatives_datum`: Relatives Datum (z.B. "<t:1744819440:R>" für "in 3 Tagen")\n' +
            '- `kommentar`: Optionaler Kommentar zum Termin' 
        },
        {
          name: '/adduser',
          value: 'Fügt nachträglich Teilnehmer zu einem bestehenden Termin hinzu'
        },
        {
          name: 'Parameter für /adduser',
          value: '- `eventid`: Die Event-ID aus dem Footer der Terminnachricht\n' +
                 '- `teilnehmer`: Zu hinzufügende Teilnehmer oder Rollen (z.B. "@Nutzer1 @TeamRolle")'
        },
        {
          name: '/removeuser',
          value: 'Entfernt Teilnehmer aus einem bestehenden Termin'
        },
        {
          name: 'Parameter für /removeuser',
          value: '- `eventid`: Die Event-ID aus dem Footer der Terminnachricht\n' +
                 '- `teilnehmer`: Zu entfernende Teilnehmer oder Rollen (z.B. "@Nutzer1 @TeamRolle")'
        },
        { 
          name: 'Admin-Funktionen', 
          value: 'Nur Administratoren können:\n' +
            '- Termine erstellen\n' +
            '- Teilnehmer hinzufügen oder entfernen\n' +
            '- Erinnerungen senden (an alle, die noch nicht geantwortet haben)\n' +
            '- Starterinnerungen senden (an alle zugesagten Teilnehmer)\n' +
            '- Terminsuchen abbrechen (mit optionalem Grund und Benachrichtigungsoption)\n' +
            '- Terminsuchen schließen' 
        },
        { 
          name: 'Teilnehmer-Optionen', 
          value: '- **Zusagen**: Bestätigt die Teilnahme zur angegebenen Zeit\n' +
            '- **Zusagen mit Vorbehalt**: Teilnahme mit gewissen Vorbehalten oder Unsicherheiten\n' +
            '- **Zusagen ohne Uhrzeitgarantie**: Teilnahme wahrscheinlich, aber nicht zeitlich festgelegt\n' +
            '- **Andere Uhrzeit**: Öffnet ein Eingabefeld für alternative Uhrzeiten\n' +
            '- **Absagen**: Lehnt die Teilnahme ab' 
        },
        {
          name: 'Abbruch-Feature',
          value: 'Beim Abbrechen einer Terminsuche öffnet sich ein Eingabefeld mit folgenden Optionen:\n' +
            '- **Abbruchgrund** (optional): Begründung für den Abbruch (wird im Status angezeigt)\n' +
            '- **Benachrichtigung**: 0 = keine DMs, 1 = alle zugesagten Teilnehmer werden per DM über den Abbruch informiert\n' +
            '- Der Abbruchgrund wird sowohl im Server-Footer als auch bei Antwortversuchen angezeigt'
        },
        {
          name: 'Besondere Features',
          value: '- Antworten sowohl per DM als auch direkt im Channel möglich\n' +
            '- Rollenunterstützung: Lade ganze Teams mit einem Befehl ein\n' +
            '- Automatische Aktualisierung der Teilnehmertabelle im Server\n' +
            '- Unterstützung für Discord-Zeitstempel (automatische Anpassung an Zeitzonen)\n' +
            '- Separate Erinnerungsfunktion für ausstehende Antworten\n' +
            '- Terminstart-Erinnerung für zugesagte Teilnehmer\n' +
            '- Flexible Zusage-Optionen für verschiedene Teilnahme-Szenarien\n' +
            '- Automatische Registrierung der Befehle auf allen Servern\n' +
            '- Intelligente Abbruchbenachrichtigungen mit optionalen Begründungen\n' +
            '- Detaillierte Erfolgs- und Fehlerstatistiken bei Event-Erstellung\n' +
            '- Live-Progress-Updates bei der Teilnehmereinladung\n' +
            '- Automatische Bot-Filterung und Duplikat-Erkennung'
        },
        {
          name: 'Datenbank & Sicherheit',
          value: 'Der Bot nutzt jetzt eine SQLite-Datenbank für bessere Performance und Zuverlässigkeit:\n' +
            '- Alle Daten werden lokal und sicher gespeichert\n' +
            '- Vollständige Audit-Historie aller Aktionen\n' +
            '- Multi-Server-Unterstützung mit Daten-Isolation\n' +
            '- Automatische Backups und Fehlerwiederherstellung\n' +
            '- Keine externe Datenbank erforderlich'
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Terminplanungsbot - Jetzt mit SQLite-Database für bessere Performance' });
    
    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  },
};