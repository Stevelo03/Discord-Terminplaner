import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, EmbedBuilder } from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('terminbot-hilfe')
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
            '- `teilnehmer`: Liste von Nutzern (z.B. "@Nutzer1 @Nutzer2")\n\n' +
            '**Optionale Felder:**\n' +
            '- `relatives_datum`: Relatives Datum (z.B. "<t:1744819440:R>" für "in 3 Tagen")\n' +
            '- `kommentar`: Optionaler Kommentar zum Termin' 
        },
        { 
          name: 'Admin-Funktionen', 
          value: 'Nur Administratoren können:\n' +
            '- Termine erstellen\n' +
            '- Erinnerungen senden (an alle, die noch nicht geantwortet haben)\n' +
            '- Terminsuchen abbrechen\n' +
            '- Terminsuchen schließen' 
        },
        { 
          name: 'Teilnehmer-Optionen', 
          value: '- **Zusagen**: Bestätigt die Teilnahme zur angegebenen Zeit\n' +
            '- **Zusagen ohne Uhrzeitgarantie**: Teilnahme wahrscheinlich, aber nicht zeitlich festgelegt\n' +
            '- **Andere Uhrzeit**: Öffnet ein Eingabefeld für alternative Uhrzeiten\n' +
            '- **Absagen**: Lehnt die Teilnahme ab' 
        },
        {
          name: 'Besondere Features',
          value: '- Antworten sowohl per DM als auch direkt im Channel möglich\n' +
            '- Automatische Aktualisierung der Teilnehmertabelle im Server\n' +
            '- Unterstützung für Discord-Zeitstempel (automatische Anpassung an Zeitzonen)\n' +
            '- Separate Erinnerungsfunktion für ausstehende Antworten\n' +
            '- Automatische Registrierung der Befehle auf allen Servern'
        },
        {
          name: 'Hinweis',
          value: 'Der Bot speichert alle Daten lokal und benötigt keine externe Datenbank.\n' +
            'Alle Teilnehmerdaten werden sicher und privat behandelt.'
        }
      )
      .setTimestamp()
      .setFooter({ text: 'Terminplanungsbot - Entwickelt für effiziente Terminplanung' });
    
    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  },
};