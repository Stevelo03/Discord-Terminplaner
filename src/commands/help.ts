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
        { name: '/termin', value: 'Erstellt eine neue Terminsuche und lädt Teilnehmer ein' },
        { name: 'Parameter für /termin', value: '- `titel`: Name des Events (z.B. "ARMA 3")\n- `datum`: Datum des Events (z.B. "25.04.2025")\n- `uhrzeit`: Uhrzeit des Events (z.B. "20:00")\n- `teilnehmer`: Liste von Nutzern (z.B. "@Nutzer1 @Nutzer2")' },
        { name: 'Admin-Funktionen', value: 'Nur Administratoren können Termine erstellen und verwalten.' },
        { name: 'Teilnehmer-Optionen', value: '- Zusagen: Bestätigt die Teilnahme\n- Zusagen ohne Uhrzeitgarantie: Teilnahme wahrscheinlich, aber nicht zeitlich festgelegt\n- Andere Uhrzeit: Möchte teilnehmen, aber zu einer anderen Zeit\n- Absagen: Lehnt die Teilnahme ab' }
      )
      .setTimestamp()
      .setFooter({ text: 'Terminplanungsbot' });
    
    await interaction.reply({ embeds: [helpEmbed], ephemeral: true });
  },
};