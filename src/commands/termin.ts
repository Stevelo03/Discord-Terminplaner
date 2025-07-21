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
        .setDescription('Uhrzeit des Events (z.B. "20:00")')
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
      
      await interaction.deferReply({ ephemeral: true });
      
      // Überprüfen, ob die Interaktion in einem Server stattfindet
      if (!interaction.guild) {
        await interaction.editReply({ content: "Dieser Befehl kann nur auf einem Server ausgeführt werden." });
        return;
      }
      
      // Validate input
      if (!title.trim()) {
        await interaction.editReply({ content: "❌ **Titel erforderlich**\n\nBitte gib einen gültigen Titel für das Event an." });
        return;
      }
      
      if (!date.trim()) {
        await interaction.editReply({ content: "❌ **Datum erforderlich**\n\nBitte gib ein gültiges Datum an (z.B. \"25.04.2025\")." });
        return;
      }
      
      if (!time.trim()) {
        await interaction.editReply({ content: "❌ **Uhrzeit erforderlich**\n\nBitte gib eine gültige Uhrzeit an (z.B. \"20:00\")." });
        return;
      }
      
      // Validate time format
      const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(time.trim())) {
        await interaction.editReply({ 
          content: "❌ **Ungültiges Uhrzeitformat**\n\nBitte verwende das Format HH:MM (z.B. \"20:00\" oder \"14:30\")." 
        });
        return;
      }
      
      // Validate date format (basic check)
      const dateRegex = /^\d{1,2}\.\d{1,2}\.\d{4}$/;
      if (!dateRegex.test(date.trim())) {
        await interaction.editReply({ 
          content: "❌ **Ungültiges Datumsformat**\n\nBitte verwende das Format TT.MM.JJJJ (z.B. \"25.04.2025\")." 
        });
        return;
      }
      
      // Parse and validate date
      const [day, month, year] = date.split('.').map(num => parseInt(num));
      const eventDate = new Date(year, month - 1, day);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      if (eventDate < today) {
        await interaction.editReply({ 
          content: "❌ **Datum liegt in der Vergangenheit**\n\nBitte wähle ein Datum in der Zukunft." 
        });
        return;
      }
      
      if (year < 2024 || year > 2030) {
        await interaction.editReply({ 
          content: "❌ **Ungültiges Jahr**\n\nBitte wähle ein Jahr zwischen 2024 und 2030." 
        });
        return;
      }
      
      if (month < 1 || month > 12) {
        await interaction.editReply({ 
          content: "❌ **Ungültiger Monat**\n\nBitte wähle einen Monat zwischen 1 und 12." 
        });
        return;
      }
      
      if (day < 1 || day > 31) {
        await interaction.editReply({ 
          content: "❌ **Ungültiger Tag**\n\nBitte wähle einen Tag zwischen 1 und 31." 
        });
        return;
      }
      
      // Title length validation
      if (title.length > 100) {
        await interaction.editReply({ 
          content: "❌ **Titel zu lang**\n\nDer Titel darf maximal 100 Zeichen lang sein." 
        });
        return;
      }
      
      // Comment length validation
      if (comment && comment.length > 500) {
        await interaction.editReply({ 
          content: "❌ **Kommentar zu lang**\n\nDer Kommentar darf maximal 500 Zeichen lang sein." 
        });
        return;
      }
      
      // Teilnehmer-IDs und Rollen-IDs extrahieren
      const userMatches = participantsString.match(/<@!?(\d+)>/g) || [];
      const roleMatches = participantsString.match(/<@&(\d+)>/g) || [];
      
      // Direkt erwähnte Benutzer-IDs extrahieren
      const userIds = userMatches.map((match: string) => match.replace(/<@!?(\d+)>/, '$1'));
      
      // Rollen-IDs extrahieren und Benutzer in diesen Rollen sammeln
      const roleIds = roleMatches.map((match: string) => match.replace(/<@&(\d+)>/, '$1'));
      const userIdsFromRoles: string[] = [];
      const processedRoleNames: string[] = [];
      
      // Verarbeite alle Rollen und sammle deren Mitglieder
      if (roleIds.length > 0) {
        console.log(`Processing ${roleIds.length} roles for event creation...`);
        
        try {
          // Hole alle Mitglieder der Guild
          await interaction.guild.members.fetch();
          
          for (const roleId of roleIds) {
            try {
              const role = await interaction.guild.roles.fetch(roleId);
              if (!role) {
                console.log(`Role with ID ${roleId} not found`);
                continue;
              }
              
              processedRoleNames.push(role.name);
              console.log(`Processing role: ${role.name} with ${role.members.size} members`);
              
              // Channel für Berechtigungsprüfung
              const channel = interaction.channel as TextChannel;
              
              // Verarbeite alle Mitglieder der Rolle
              for (const [memberId, member] of role.members) {
                console.log(`Checking member: ${member.user.username}`);
                
                // Skip bots
                if (member.user.bot) {
                  console.log(`- Skipping bot: ${member.user.username}`);
                  continue;
                }
                
                // Überspringe, wenn Benutzer bereits in der Liste ist
                if (userIds.includes(memberId) || userIdsFromRoles.includes(memberId)) {
                  console.log(`- User ${member.user.username} already in list`);
                  continue;
                }
                
                // Prüfe, ob das Mitglied den Channel sehen kann
                if (channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) {
                  console.log(`- User ${member.user.username} has visibility and will be added`);
                  userIdsFromRoles.push(memberId);
                } else {
                  console.log(`- User ${member.user.username} cannot see this channel`);
                }
              }
            } catch (error) {
              console.error(`Error processing role ${roleId}:`, error);
              await interaction.followUp({ 
                content: `⚠️ **Warnung**: Rolle mit ID ${roleId} konnte nicht verarbeitet werden.`, 
                ephemeral: true 
              });
            }
          }
        } catch (error) {
          console.error('Error fetching guild members:', error);
          await interaction.editReply({ 
            content: "❌ **Fehler beim Laden der Servermitglieder**\n\nBitte versuche es später erneut." 
          });
          return;
        }
      }
      
      // Alle Benutzer-IDs kombinieren (ohne Duplikate)
      const allUserIds = [...new Set([...userIds, ...userIdsFromRoles])];
      console.log(`Total users to invite: ${allUserIds.length}`);
      
      // Validate participants
      if (allUserIds.length === 0) {
        await interaction.editReply({ 
          content: "❌ **Keine gültigen Teilnehmer**\n\nBitte erwähne mindestens einen Benutzer oder eine Rolle.\n\n💡 **Beispiel:** `@Nutzer1 @TeamRolle`" 
        });
        return;
      }
      
      if (allUserIds.length > 50) {
        await interaction.editReply({ 
          content: "❌ **Zu viele Teilnehmer**\n\nMaximal 50 Teilnehmer pro Event erlaubt.\n\n📊 **Gefunden:** " + allUserIds.length + " Teilnehmer" 
        });
        return;
      }
      
      // Validate that mentioned users exist and are not bots
      let validUserIds: string[] = [];
      let invalidUsers = 0;
      let botUsers = 0;
      
      for (const userId of allUserIds) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          if (member.user.bot) {
            botUsers++;
            console.log(`Skipping bot user: ${member.user.username}`);
            continue;
          }
          validUserIds.push(userId);
        } catch (error) {
          invalidUsers++;
          console.warn(`User ${userId} not found in guild`);
        }
      }
      
      if (validUserIds.length === 0) {
        await interaction.editReply({ 
          content: "❌ **Keine gültigen Teilnehmer gefunden**\n\nAlle erwähnten Benutzer sind entweder Bots oder nicht auf diesem Server.\n\n🤖 **Bots:** " + botUsers + "\n❓ **Nicht gefunden:** " + invalidUsers 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `🔄 **Event wird erstellt...**\n\n📝 **Titel:** ${title}\n📅 **Datum:** ${date} um ${time} Uhr\n👥 **Teilnehmer:** ${validUserIds.length} Personen${processedRoleNames.length > 0 ? `\n🏷️ **Rollen:** ${processedRoleNames.join(', ')}` : ''}\n\n⏳ Bitte warten...` 
      });
      
      try {
        // Event erstellen
        const eventId = await createEvent(
          title,
          date,
          time,
          interaction.user.id,
          validUserIds,
          interaction.channel as TextChannel,
          relativeDate,
          comment
        );
        
        console.log(`Event created with ID: ${eventId}`);
        
        // Progress update
        await interaction.editReply({ 
          content: `✅ **Event erstellt!**\n\n📝 **Event ID:** ${eventId}\n👥 **Lade ${validUserIds.length} Teilnehmer ein...**\n\n⏳ Bitte warten...` 
        });
        
        // Teilnehmer einladen
        let successCount = 0;
        let failCount = 0;
        let failedUsernames: string[] = [];
        
        // Batch processing für bessere Performance
        const batchSize = 5;
        for (let i = 0; i < validUserIds.length; i += batchSize) {
          const batch = validUserIds.slice(i, i + batchSize);
          
          const batchPromises = batch.map(async (userId) => {
            try {
              const user = await interaction.client.users.fetch(userId);
              const success = await inviteParticipant(
                eventId, 
                user, 
                title, 
                date, 
                time, 
                relativeDate, 
                comment
              );
              
              if (success) {
                successCount++;
                console.log(`✅ Successfully invited: ${user.username}`);
              } else {
                failCount++;
                failedUsernames.push(user.username);
                console.log(`❌ Failed to invite: ${user.username}`);
              }
            } catch (error) {
              console.error(`Error inviting user ${userId}:`, error);
              failCount++;
              
              try {
                const user = await interaction.client.users.fetch(userId);
                failedUsernames.push(user.username);
              } catch {
                failedUsernames.push(`ID:${userId}`);
              }
            }
          });
          
          await Promise.all(batchPromises);
          
          // Progress update for large batches
          if (validUserIds.length > 10 && i + batchSize < validUserIds.length) {
            const progress = Math.round(((i + batchSize) / validUserIds.length) * 100);
            await interaction.editReply({ 
              content: `✅ **Event erstellt!**\n\n📝 **Event ID:** ${eventId}\n👥 **Einladungen:** ${i + batchSize}/${validUserIds.length} (${progress}%)\n\n⏳ Wird fortgesetzt...` 
            });
          }
        }
        
        // Erstelle Zusammenfassung über eingeladene Rollen
        let rolesSummary = "";
        if (processedRoleNames.length > 0) {
          rolesSummary = `\n🏷️ **Eingeladene Rollen:** ${processedRoleNames.join(', ')}`;
        }
        
        // Erstelle Zusammenfassung über fehlgeschlagene Einladungen
        let failedSummary = "";
        if (failedUsernames.length > 0) {
          if (failedUsernames.length <= 10) {
            failedSummary = `\n\n⚠️ **Fehlgeschlagene Einladungen:**\n${failedUsernames.map(name => `• ${name}`).join('\n')}`;
          } else {
            failedSummary = `\n\n⚠️ **Fehlgeschlagene Einladungen:** ${failedUsernames.length} (siehe Logs für Details)`;
          }
        }
        
        // Warnings für gefilterte Benutzer
        let warningsSummary = "";
        if (botUsers > 0 || invalidUsers > 0) {
          warningsSummary = `\n\n💡 **Hinweise:**`;
          if (botUsers > 0) {
            warningsSummary += `\n• ${botUsers} Bots wurden übersprungen`;
          }
          if (invalidUsers > 0) {
            warningsSummary += `\n• ${invalidUsers} Benutzer nicht auf diesem Server gefunden`;
          }
        }
        
        // Final success message
        const finalMessage = `🎉 **Terminsuche erfolgreich erstellt!**

📝 **Event:** ${title}
📅 **Datum:** ${date} um ${time} Uhr
🆔 **Event ID:** ${eventId}

📊 **Einladungsstatistik:**
✅ ${successCount} Teilnehmer erfolgreich eingeladen
${failCount > 0 ? `❌ ${failCount} Einladungen fehlgeschlagen` : '✨ Alle Einladungen erfolgreich!'}${rolesSummary}${failedSummary}${warningsSummary}

🔔 **Nächste Schritte:**
• Teilnehmer erhalten DMs mit Antwortmöglichkeiten
• Status wird automatisch im Channel aktualisiert
• Verwende die Admin-Buttons für Erinnerungen

💡 **Tipp:** Mit \`/adduser eventid:${eventId}\` können später weitere Teilnehmer hinzugefügt werden.`;

        await interaction.editReply({ content: finalMessage });
        
        console.log(`✅ Event creation completed: ${eventId} | Success: ${successCount} | Failed: ${failCount}`);
        
      } catch (eventError) {
        console.error('Error during event creation:', eventError);
        await interaction.editReply({ 
          content: `❌ **Event-Erstellung fehlgeschlagen**\n\n**Fehler:** ${eventError instanceof Error ? eventError.message : 'Unbekannter Fehler'}\n\n💡 **Lösungsvorschläge:**\n• Prüfe die Bot-Berechtigungen\n• Versuche es mit weniger Teilnehmern\n• Kontaktiere den Administrator` 
        });
      }
      
    } catch (mainError) {
      console.error("Critical error in termin command:", mainError);
      
      try {
        const errorMessage = mainError instanceof Error ? mainError.message : 'Unbekannter Fehler';
        const response = `❌ **Kritischer Fehler aufgetreten**\n\n\`\`\`${errorMessage}\`\`\`\n\n🔧 **Hilfe:**\n• Prüfe deine Eingabe\n• Versuche es später erneut\n• Kontaktiere den Support falls das Problem bestehen bleibt`;
        
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