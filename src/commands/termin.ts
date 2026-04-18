// src/commands/termin.ts
import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { TextChannel, PermissionFlagsBits } from 'discord.js';
import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { createEvent, inviteParticipant } from '../terminManager';
import { CONFIG } from '../config';
import { db } from '../db';
import { events } from '../db/schema';
import { eq } from 'drizzle-orm';

async function fetchMemberWithTimeout(guild: any, userId: string): Promise<GuildMember> {
  return Promise.race([
    guild.members.fetch(userId) as Promise<GuildMember>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout fetching member ${userId}`)), CONFIG.USER_FETCH_TIMEOUT_MS)
    )
  ]);
}

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

      // Verify command is run in a text channel
      if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
        await interaction.editReply({ content: "❌ Dieser Befehl kann nur in Text-Kanälen ausgeführt werden." });
        return;
      }
      const textChannel = interaction.channel as TextChannel;

      // Basic validation
      if (!title.trim()) {
        await interaction.editReply({ content: "❌ Titel erforderlich" });
        return;
      }

      if (title.length > CONFIG.MAX_EVENT_TITLE_LENGTH) {
        await interaction.editReply({ content: `❌ Titel zu lang (max ${CONFIG.MAX_EVENT_TITLE_LENGTH} Zeichen)` });
        return;
      }

      if (comment && comment.length > CONFIG.MAX_COMMENT_LENGTH) {
        await interaction.editReply({ content: `❌ Kommentar zu lang (max ${CONFIG.MAX_COMMENT_LENGTH} Zeichen)` });
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

      if (eventDate.getFullYear() > CONFIG.MAX_TIMESTAMP_YEAR) {
        await interaction.editReply({ content: `❌ Zeitstempel zu weit in der Zukunft (max ${CONFIG.MAX_TIMESTAMP_YEAR})` });
        return;
      }

      // Derive date/time/relativeDate from the single timestamp
      const finalDate = `<t:${unixSeconds}:D>`;
      const finalTime = `<t:${unixSeconds}:t>`;
      const finalRelativeDate = `<t:${unixSeconds}:R>`;

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

                for (const [memberId, member] of role.members) {
                  if (!member.user.bot &&
                      !allUserIds.includes(memberId) &&
                      textChannel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) {
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

      if (allUserIds.length > CONFIG.MAX_PARTICIPANTS_PER_EVENT) {
        await interaction.editReply({ content: `❌ Zu viele Teilnehmer (${allUserIds.length}/${CONFIG.MAX_PARTICIPANTS_PER_EVENT})` });
        return;
      }

      // Validate users exist and are not bots
      let validUserIds: string[] = [];
      let botUsers = 0;
      let invalidUsers = 0;

      for (const userId of allUserIds) {
        try {
          const member = await fetchMemberWithTimeout(interaction.guild, userId);
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
          textChannel,
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

        // If no invitations succeeded, cancel the event to avoid orphaned records
        if (successCount === 0 && failCount > 0) {
          try {
            await db.update(events)
              .set({ status: 'CANCELLED', cancelledAt: new Date() })
              .where(eq(events.id, eventId));
          } catch (cleanupError) {
            console.error('Error cleaning up event after failed invitations:', cleanupError);
          }
          await interaction.editReply({
            content: `❌ Event-Erstellung fehlgeschlagen: Keine Einladungen konnten zugestellt werden. Das Event wurde nicht angelegt.`
          });
          return;
        }

        // Final message
        const rolesSummary = processedRoleNames.length > 0 ? `\n🏷️ Rollen: ${processedRoleNames.join(', ')}` : '';
        const failedSummary = failedUsernames.length > 0 ? `\n⚠️ Fehlgeschlagen: ${failedUsernames.length}` : '';
        const warningsSummary = (botUsers > 0 || invalidUsers > 0) ? `\n💡 Übersprungen: ${botUsers} Bots, ${invalidUsers} nicht gefunden` : '';

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
          content: `❌ Event-Erstellung fehlgeschlagen. Bitte versuche es erneut.`
        });
      }

    } catch (mainError) {
      console.error("Critical error in termin command:", mainError);

      try {
        const response = `❌ Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.`;

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
