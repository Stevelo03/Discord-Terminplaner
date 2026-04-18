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
      option.setName('zeitstempel')
        .setDescription('Discord-Zeitstempel des Events (z.B. <t:1744819440:F>)')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('teilnehmer')
        .setDescription('IDs der Teilnehmer oder Rollen (@user1, @rolle1)')
        .setRequired(true))
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
      const zeitstempelInput = interaction.options.getString('zeitstempel') || '';
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

      if (title.length > 100) {
        await interaction.editReply({ content: "❌ Titel zu lang (max 100 Zeichen)" });
        return;
      }

      if (comment && comment.length > 500) {
        await interaction.editReply({ content: "❌ Kommentar zu lang (max 500 Zeichen)" });
        return;
      }

      // Parse Discord timestamp – only format accepted
      const timestampMatch = zeitstempelInput.match(/<t:(\d+):[DdTtRrFf]>/);
      if (!timestampMatch) {
        await interaction.editReply({
          content: "❌ Ungültiger Zeitstempel.\n\nVerwende einen Discord-Zeitstempel, z.B. `<t:1744819440:F>`.\n\nDu kannst Zeitstempel auf **discordtimestamp.com** oder ähnlichen Seiten erstellen."
        });
        return;
      }

      const unixSeconds = parseInt(timestampMatch[1]);
      const eventDate = new Date(unixSeconds * 1000);

      if (isNaN(eventDate.getTime())) {
        await interaction.editReply({ content: "❌ Ungültiger Discord-Zeitstempel" });
        return;
      }

      if (eventDate.getTime() <= Date.now()) {
        await interaction.editReply({ content: "❌ Der Zeitstempel liegt in der Vergangenheit. Bitte einen zukünftigen Termin angeben." });
        return;
      }

      // Derive date/time/relativeDate from the single timestamp
      const finalDate = `<t:${unixSeconds}:D>`;       // Renders as localized date
      const finalTime = `<t:${unixSeconds}:t>`;        // Renders as localized short time
      const finalRelativeDate = `<t:${unixSeconds}:R>`; // Always present, renders as "in X days"

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
        content: `🔄 Event wird erstellt...\n\n📝 ${title}\n📅 ${finalDate} ${finalTime} (${finalRelativeDate})\n👥 ${validUserIds.length} Teilnehmer\n\n⏳ Bitte warten...`
      });

      try {
        // Create event – pass unix seconds for exact parsedDate storage
        const eventId = await createEvent(
          title,
          finalDate,
          finalTime,
          interaction.user.id,
          validUserIds,
          interaction.channel as TextChannel,
          finalRelativeDate,
          comment,
          unixSeconds
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
📅 Termin: ${finalDate} ${finalTime} (${finalRelativeDate})
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
