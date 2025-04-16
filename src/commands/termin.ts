import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, TextChannel } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { ChatInputCommandInteraction } from 'discord.js';
import { createEvent, inviteParticipant } from '../terminManager';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('termin')
    .setDescription('Erstellt eine neue Terminsuche')
    .addStringOption(option => 
      option.setName('titel')
        .setDescription('Titel des Events (z.B. "ARMA 3")')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('datum')
        .setDescription('Datum des Events (z.B. "25.04.2025" oder "<t:1744819440:D>")')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('uhrzeit')
        .setDescription('Uhrzeit des Events (z.B. "20:00")')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('teilnehmer')
        .setDescription('IDs der Teilnehmer, getrennt durch Kommas (z.B. "@user1, @user2")')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('relatives_datum')
        .setDescription('Relatives Datum (z.B. "<t:1744819440:R>" für "in 3 Tagen")')
        .setRequired(false))
    .addStringOption(option => 
      option.setName('kommentar')
        .setDescription('Optionaler Kommentar zum Termin')
        .setRequired(false)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    // Überprüfen, ob der Nutzer Administrator ist
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Du hast keine Berechtigung, diesen Befehl zu nutzen.", ephemeral: true });
      return;
    }
    
    const title = interaction.options.getString('titel') || '';
    const date = interaction.options.getString('datum') || '';
    const time = interaction.options.getString('uhrzeit') || '';
    const relativeDate = interaction.options.getString('relatives_datum');
    const comment = interaction.options.getString('kommentar');
    const participantsString = interaction.options.getString('teilnehmer') || '';
    
    // Teilnehmer-IDs extrahieren
    const participantMatches = participantsString.match(/<@!?(\d+)>/g) || [];
    const participantIds = participantMatches.map((match: string) => match.replace(/<@!?(\d+)>/, '$1'));
    
    if (participantIds.length === 0) {
      await interaction.reply({ content: "Bitte gib mindestens einen gültigen Teilnehmer an.", ephemeral: true });
      return;
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    // Event erstellen
    const eventId = await createEvent(
      title,
      date,
      time,
      interaction.user.id,
      participantIds,
      interaction.channel as TextChannel,
      relativeDate,
      comment
    );
    
    // Teilnehmer einladen
    let successCount = 0;
    let failCount = 0;
    
    for (const userId of participantIds) {
      try {
        const user = await interaction.client.users.fetch(userId);
        await inviteParticipant(eventId, user, title, date, time, relativeDate, comment);
        successCount++;
      } catch (error) {
        console.error(`Fehler beim Einladen von Benutzer ${userId}:`, error);
        failCount++;
      }
    }
    
    await interaction.editReply(
      `Terminsuche erstellt!\n` +
      `✅ ${successCount} Teilnehmer erfolgreich eingeladen.\n` +
      (failCount > 0 ? `❌ ${failCount} Einladungen konnten nicht gesendet werden.` : '')
    );
  },
};