// src/commands/termin.ts
import { SlashCommandBuilder } from 'discord.js';
import { CommandInteraction, TextChannel, GuildMember, Role } from 'discord.js';
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
        .setDescription('Uhrzeit des Events (z.B. "20:00" oder "<t:1744819440:t>")')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('teilnehmer')
        .setDescription('IDs der Teilnehmer oder Rollen (@user1, @rolle1)')
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
    try {
      // Admin check
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Du hast keine Berechtigung, diesen Befehl zu nutzen.", ephemeral: true });
        return;
      }
      
      const title = interaction.options.getString('titel') || '';
      const dateInput = interaction.options.getString('datum') || '';
      const timeInput = interaction.options.getString('uhrzeit') || '';
      const relativeDate = interaction.options.getString('relatives_datum');
      const comment = interaction.options.getString('kommentar');
      const participantsString = interaction.options.getString('teilnehmer') || '';
      
      await interaction.deferReply({ ephemeral: true });
      
      if (!interaction.guild) {
        await interaction.editReply({ content: "Dieser Befehl kann nur auf einem Server ausgeführt werden." });
        return;
      }
      
      // Basic validation
      if (!title.trim()) {
        await interaction.editReply({ content: "❌ Titel erforderlich" });
        return;
      }
      
      if (!dateInput.trim()) {
        await interaction.editReply({ content: "❌ Datum erforderlich" });
        return;
      }
      
      if (!timeInput.trim()) {
        await interaction.editReply({ content: "❌ Uhrzeit erforderlich" });
        return;
      }
      
      // Parse Discord timestamps or use normal format
      let finalDate = dateInput.trim();
      let finalTime = timeInput.trim();
      let finalRelativeDate = relativeDate;
      
      // Handle Discord timestamp in date
      const dateTimestampMatch = dateInput.match(/<t:(\d+):([DdTtRrFf])>/);
      if (dateTimestampMatch) {
        const unixTime = parseInt(dateTimestampMatch[1]);
        const date = new Date(unixTime * 1000);
        
        if (isNaN(date.getTime())) {
          await interaction.editReply({ content: "❌ Ungültiger Discord-Zeitstempel im Datum" });
          return;
        }
        
        // Convert to German date format
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear().toString();
        finalDate = `${day}.${month}.${year}`;
        
        // If no relative date given, create one
        if (!finalRelativeDate) {
          finalRelativeDate = `<t:${unixTime}:R>`;
        }
      } else {
        // Validate normal date format
        const dateRegex = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
        if (!dateRegex.test(finalDate)) {
          await interaction.editReply({ 
            content: "❌ Ungültiges Datumsformat. Verwende DD.MM.YYYY oder Discord-Zeitstempel <t:TIMESTAMP:D>" 
          });
          return;
        }
        
        // Basic date validation
        const [day, month, year] = finalDate.split('.').map(num => parseInt(num));
        const eventDate = new Date(year, month - 1, day);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (eventDate < today) {
          await interaction.editReply({ content: "❌ Datum liegt in der Vergangenheit" });
          return;
        }
        
        if (year < 2024 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
          await interaction.editReply({ content: "❌ Ungültiges Datum" });
          return;
        }
      }
      
      // Handle Discord timestamp in time
      const timeTimestampMatch = timeInput.match(/<t:(\d+):([DdTtRrFf])>/);
      if (timeTimestampMatch) {
        const unixTime = parseInt(timeTimestampMatch[1]);
        const date = new Date(unixTime * 1000);
        
        if (isNaN(date.getTime())) {
          await interaction.editReply({ content: "❌ Ungültiger Discord-Zeitstempel in der Uhrzeit" });
          return;
        }
        
        // Extract time
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        finalTime = `${hours}:${minutes}`;
      } else {
        // Validate normal time format
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(finalTime)) {
          await interaction.editReply({ 
            content: "❌ Ungültiges Uhrzeitformat. Verwende HH:MM oder Discord-Zeitstempel <t:TIMESTAMP:t>" 
          });
          return;
        }
      }
      
      // Title and comment validation
      if (title.length > 100) {
        await interaction.editReply({ content: "❌ Titel zu lang (max 100 Zeichen)" });
        return;
      }
      
      if (comment && comment.length > 500) {
        await interaction.editReply({ content: "❌ Kommentar zu lang (max 500 Zeichen)" });
        return;
      }
      
      // Extract participants
      const userMatches = participantsString.match(/<@!?(\d+)>/g) || [];
      const roleMatches = participantsString.match(/<@&(\d+)>/g) || [];
      
      const userIds = userMatches.map((match: string) => match.replace(/<@!?(\d+)>/, '$1'));
      const roleIds = roleMatches.map((match: string) => match.replace(/<@&(\d+)>/, '$1'));
      
      let allUserIds = [...userIds];
      const processedRoleNames: string[] = [];
      
      // Process roles
      if (roleIds.length > 0) {
        try {
          await interaction.guild.members.fetch();
          
          for (const roleId of roleIds) {
            try {
              const role = await interaction.guild.roles.fetch(roleId);
              if (role) {
                processedRoleNames.push(role.name);
                const channel = interaction.channel as TextChannel;
                
                for (const [memberId, member] of role.members) {
                  if (!member.user.bot && 
                      !allUserIds.includes(memberId) && 
                      channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) {
                    allUserIds.push(memberId);
                  }
                }
              }
            } catch (error) {
              console.error(`Error processing role ${roleId}:`, error);
            }
          }
        } catch (error) {
          console.error('Error fetching guild members:', error);
          await interaction.editReply({ content: "❌ Fehler beim Laden der Servermitglieder" });
          return;
        }
      }
      
      if (allUserIds.length === 0) {
        await interaction.editReply({ content: "❌ Keine gültigen Teilnehmer gefunden" });
        return;
      }
      
      if (allUserIds.length > 50) {
        await interaction.editReply({ content: `❌ Zu viele Teilnehmer (${allUserIds.length}/50)` });
        return;
      }
      
      // Validate users exist and are not bots
      let validUserIds: string[] = [];
      let botUsers = 0;
      let invalidUsers = 0;
      
      for (const userId of allUserIds) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          if (member.user.bot) {
            botUsers++;
          } else {
            validUserIds.push(userId);
          }
        } catch (error) {
          invalidUsers++;
        }
      }
      
      if (validUserIds.length === 0) {
        await interaction.editReply({ 
          content: `❌ Keine gültigen Teilnehmer. Bots: ${botUsers}, Nicht gefunden: ${invalidUsers}` 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `🔄 Event wird erstellt...\n\n📝 ${title}\n📅 ${finalDate} um ${finalTime}\n👥 ${validUserIds.length} Teilnehmer\n\n⏳ Bitte warten...` 
      });
      
      try {
        // Create event
        const eventId = await createEvent(
          title,
          finalDate,
          finalTime,
          interaction.user.id,
          validUserIds,
          interaction.channel as TextChannel,
          finalRelativeDate,
          comment
        );
        
        // Progress update
        await interaction.editReply({ 
          content: `✅ Event erstellt!\n\n📝 Event ID: ${eventId}\n👥 Lade ${validUserIds.length} Teilnehmer ein...\n\n⏳ Bitte warten...` 
        });
        
        // Invite participants
        let successCount = 0;
        let failCount = 0;
        let failedUsernames: string[] = [];
        
        for (const userId of validUserIds) {
          try {
            const user = await interaction.client.users.fetch(userId);
            const success = await inviteParticipant(
              eventId, 
              user, 
              title, 
              finalDate,
              finalTime, 
              finalRelativeDate,
              comment
            );
            
            if (success) {
              successCount++;
            } else {
              failCount++;
              failedUsernames.push(user.username);
            }
          } catch (error) {
            failCount++;
            failedUsernames.push(`ID:${userId}`);
          }
        }
        
        // Final message
        let rolesSummary = processedRoleNames.length > 0 ? `\n🏷️ Rollen: ${processedRoleNames.join(', ')}` : '';
        let failedSummary = failedUsernames.length > 0 ? `\n⚠️ Fehlgeschlagen: ${failedUsernames.length}` : '';
        let warningsSummary = (botUsers > 0 || invalidUsers > 0) ? `\n💡 Übersprungen: ${botUsers} Bots, ${invalidUsers} nicht gefunden` : '';
        
        const finalMessage = `🎉 Terminsuche erfolgreich erstellt!

📝 Event: ${title}
📅 Datum: ${finalDate} um ${finalTime}
🆔 Event ID: ${eventId}

📊 Einladungsstatistik:
✅ ${successCount} Teilnehmer erfolgreich eingeladen
${failCount > 0 ? `❌ ${failCount} Einladungen fehlgeschlagen` : '✨ Alle Einladungen erfolgreich!'}${rolesSummary}${failedSummary}${warningsSummary}

🔔 Nächste Schritte:
• Teilnehmer erhalten DMs mit Antwortmöglichkeiten
• Status wird automatisch im Channel aktualisiert
• Verwende die Admin-Buttons für Erinnerungen`;

        await interaction.editReply({ content: finalMessage });
        
        console.log(`✅ Event creation completed: ${eventId} | Success: ${successCount} | Failed: ${failCount}`);
        
      } catch (eventError) {
        console.error('Error during event creation:', eventError);
        await interaction.editReply({ 
          content: `❌ Event-Erstellung fehlgeschlagen: ${eventError instanceof Error ? eventError.message : 'Unbekannter Fehler'}` 
        });
      }
      
    } catch (mainError) {
      console.error("Critical error in termin command:", mainError);
      
      try {
        const errorMessage = mainError instanceof Error ? mainError.message : 'Unbekannter Fehler';
        const response = `❌ Kritischer Fehler: ${errorMessage}`;
        
        if (interaction.deferred) {
          await interaction.editReply({ content: response });
        } else {
          await interaction.reply({ content: response, ephemeral: true });
        }
      } catch (e) {
        console.error("Error sending error message:", e);
      }
    }
  },
};