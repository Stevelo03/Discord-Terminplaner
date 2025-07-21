// src/commands/adduser.ts
import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommandInteraction, TextChannel, PermissionFlagsBits } from 'discord.js';
import { db } from '../db';
import { events, participants, serverUsers } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { inviteParticipant, updateEventMessage } from '../terminManager';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adduser')
    .setDescription('Fügt Benutzer zu einer existierenden Terminsuche hinzu')
    .addStringOption(option => 
      option.setName('eventid')
        .setDescription('Die Event-ID der Terminsuche (z.B. aus dem Footer der Nachricht)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('teilnehmer')
        .setDescription('Zu hinzufügende Teilnehmer oder Rollen (@user1, @rolle1)')
        .setRequired(true)),
  
  async execute(interaction: ChatInputCommandInteraction) {
    try {
      // Überprüfen, ob der Nutzer Administrator ist
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "❌ **Keine Berechtigung**\n\nDu benötigst Administrator-Rechte für diesen Befehl.", ephemeral: true });
        return;
      }
      
      const eventId = interaction.options.getString('eventid') || '';
      const participantsString = interaction.options.getString('teilnehmer') || '';
      
      await interaction.deferReply({ ephemeral: true });
      
      // Validate input
      if (!eventId.trim()) {
        await interaction.editReply({ content: "❌ **Event ID erforderlich**\n\nBitte gib eine gültige Event-ID an." });
        return;
      }
      
      if (!participantsString.trim()) {
        await interaction.editReply({ content: "❌ **Teilnehmer erforderlich**\n\nBitte erwähne mindestens einen Benutzer oder eine Rolle." });
        return;
      }
      
      // Überprüfen, ob die Interaktion in einem Server stattfindet
      if (!interaction.guild) {
        await interaction.editReply({ content: "❌ **Server erforderlich**\n\nDieser Befehl kann nur auf einem Server ausgeführt werden." });
        return;
      }
      
      // Event aus Database laden
      const eventData = await db.select()
        .from(events)
        .where(eq(events.id, eventId))
        .limit(1);
      
      if (eventData.length === 0) {
        await interaction.editReply({ 
          content: `❌ **Event nicht gefunden**\n\nKein Event mit der ID \`${eventId}\` gefunden.\n\n💡 **Tipp:** Die Event-ID findest du im Footer der Event-Nachricht.` 
        });
        return;
      }
      
      const event = eventData[0];
      
      // Prüfen, ob das Event noch aktiv ist
      if (event.status !== 'ACTIVE') {
        const statusText = event.status === 'CLOSED' ? 'geschlossen' : 'abgebrochen';
        let message = `❌ **Event ${statusText}**\n\nDiese Terminsuche wurde ${statusText}. Du kannst nur aktive Terminsuchen bearbeiten.`;
        
        if (event.status === 'CANCELLED' && event.cancellationReason) {
          message += `\n\n**Abbruchgrund:** ${event.cancellationReason}`;
        }
        
        await interaction.editReply({ content: message });
        return;
      }
      
      // Prüfen, ob Event zu diesem Server gehört
      if (event.serverId !== interaction.guild.id) {
        await interaction.editReply({ 
          content: `❌ **Event gehört nicht zu diesem Server**\n\nDas Event \`${eventId}\` wurde auf einem anderen Server erstellt.` 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `🔄 **Verarbeite Teilnehmer...**\n\n📝 **Event:** ${event.title}\n📅 **Datum:** ${event.date} um ${event.time} Uhr\n\n⏳ Analysiere Benutzer und Rollen...` 
      });
      
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
        console.log(`Processing ${roleIds.length} roles for adduser...`);
        
        try {
          // Hole alle Mitglieder der Guild
          await interaction.guild.members.fetch();
          
          for (const roleId of roleIds) {
            try {
              const role = await interaction.guild.roles.fetch(roleId);
              if (!role) {
                console.log(`Role with ID ${roleId} not found`);
                await interaction.followUp({ 
                  content: `⚠️ **Warnung:** Rolle mit ID \`${roleId}\` nicht gefunden.`, 
                  ephemeral: true 
                });
                continue;
              }
              
              processedRoleNames.push(role.name);
              console.log(`Processing role: ${role.name} with ${role.members.size} members`);
              
              // Channel für Berechtigungsprüfung
              const channel = await interaction.guild.channels.fetch(event.channelId) as TextChannel;
              
              if (!channel) {
                console.warn(`Channel ${event.channelId} not found for permission check`);
                continue;
              }
              
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
                content: `⚠️ **Warnung:** Fehler beim Verarbeiten der Rolle mit ID \`${roleId}\`.`, 
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
      console.log(`Total users to add: ${allUserIds.length}`);
      
      if (allUserIds.length === 0) {
        await interaction.editReply({ 
          content: "❌ **Keine gültigen Teilnehmer**\n\nBitte erwähne mindestens einen gültigen Benutzer oder eine Rolle.\n\n💡 **Beispiel:** `@Nutzer1 @TeamRolle`" 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `🔄 **Prüfe bestehende Teilnehmer...**\n\n📝 **Event:** ${event.title}\n👥 **Gefunden:** ${allUserIds.length} Benutzer${processedRoleNames.length > 0 ? `\n🏷️ **Rollen:** ${processedRoleNames.join(', ')}` : ''}\n\n⏳ Filtere bereits eingeladene Benutzer...` 
      });
      
      // Bereits vorhandene Teilnehmer aus Database laden
      const existingParticipants = await db.query.participants.findMany({
        where: eq(participants.eventId, eventId),
        with: {
          serverUser: true
        }
      });
      
      const existingUserIds = existingParticipants.map(p => p.serverUser.userId);
      const newUserIds = allUserIds.filter(id => !existingUserIds.includes(id));
      
      if (newUserIds.length === 0) {
        const existingCount = allUserIds.length;
        await interaction.editReply({ 
          content: `ℹ️ **Alle Benutzer bereits eingeladen**\n\nAlle ${existingCount} angegebenen Teilnehmer sind bereits Teil dieser Terminsuche.\n\n📊 **Bestehende Teilnehmer:** ${existingParticipants.length}\n💡 **Tipp:** Verwende \`/removeuser\` um Teilnehmer zu entfernen.` 
        });
        return;
      }
      
      // Validate new participants
      let validNewUserIds: string[] = [];
      let invalidUsers = 0;
      let botUsers = 0;
      
      for (const userId of newUserIds) {
        try {
          const member = await interaction.guild.members.fetch(userId);
          if (member.user.bot) {
            botUsers++;
            console.log(`Skipping bot user: ${member.user.username}`);
            continue;
          }
          validNewUserIds.push(userId);
        } catch (error) {
          invalidUsers++;
          console.warn(`User ${userId} not found in guild`);
        }
      }
      
      if (validNewUserIds.length === 0) {
        await interaction.editReply({ 
          content: `❌ **Keine neuen gültigen Teilnehmer**\n\nAlle neuen Benutzer sind entweder Bots oder nicht auf diesem Server.\n\n🤖 **Bots:** ${botUsers}\n❓ **Nicht gefunden:** ${invalidUsers}\n📊 **Bereits eingeladen:** ${existingUserIds.length}` 
        });
        return;
      }
      
      // Check participant limit
      const totalAfterAdd = existingParticipants.length + validNewUserIds.length;
      if (totalAfterAdd > 50) {
        await interaction.editReply({ 
          content: `❌ **Teilnehmer-Limit erreicht**\n\nMaximal 50 Teilnehmer pro Event erlaubt.\n\n📊 **Aktuell:** ${existingParticipants.length}\n➕ **Hinzufügen:** ${validNewUserIds.length}\n🔢 **Gesamt:** ${totalAfterAdd} (Limit: 50)\n\n💡 **Tipp:** Entferne erst einige Teilnehmer mit \`/removeuser\`.` 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `✅ **Beginne Einladungen...**\n\n📝 **Event:** ${event.title}\n👥 **Neue Teilnehmer:** ${validNewUserIds.length}\n📊 **Gesamt nach Hinzufügung:** ${totalAfterAdd}\n\n⏳ Sende Einladungen...` 
      });
      
      // Teilnehmer einladen
      let successCount = 0;
      let failCount = 0;
      let failedUsernames: string[] = [];
      
      // Batch processing für bessere Performance
      const batchSize = 5;
      for (let i = 0; i < validNewUserIds.length; i += batchSize) {
        const batch = validNewUserIds.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (userId) => {
          try {
            const user = await interaction.client.users.fetch(userId);
            const success = await inviteParticipant(
              eventId, 
              user, 
              event.title, 
              event.date, 
              event.time, 
              event.relativeDate, 
              event.comment
            );
            
            if (success) {
              successCount++;
              console.log(`✅ Successfully added: ${user.username}`);
            } else {
              failCount++;
              failedUsernames.push(user.username);
              console.log(`❌ Failed to add: ${user.username}`);
            }
          } catch (error) {
            console.error(`Error adding user ${userId}:`, error);
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
        
        // Progress update for larger batches
        if (validNewUserIds.length > 10 && i + batchSize < validNewUserIds.length) {
          const progress = Math.round(((i + batchSize) / validNewUserIds.length) * 100);
          await interaction.editReply({ 
            content: `✅ **Einladungen laufen...**\n\n📝 **Event:** ${event.title}\n👥 **Fortschritt:** ${i + batchSize}/${validNewUserIds.length} (${progress}%)\n\n⏳ Wird fortgesetzt...` 
          });
        }
      }
      
      // Erstelle Zusammenfassung über eingeladene Rollen
      let rolesSummary = "";
      if (processedRoleNames.length > 0) {
        rolesSummary = `\n🏷️ **Verarbeitete Rollen:** ${processedRoleNames.join(', ')}`;
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
      if (botUsers > 0 || invalidUsers > 0 || (allUserIds.length - newUserIds.length) > 0) {
        warningsSummary = `\n\n💡 **Hinweise:**`;
        if (botUsers > 0) {
          warningsSummary += `\n• ${botUsers} Bots wurden übersprungen`;
        }
        if (invalidUsers > 0) {
          warningsSummary += `\n• ${invalidUsers} Benutzer nicht auf diesem Server gefunden`;
        }
        const alreadyInvited = allUserIds.length - newUserIds.length;
        if (alreadyInvited > 0) {
          warningsSummary += `\n• ${alreadyInvited} Benutzer waren bereits eingeladen`;
        }
      }
      
      // Final success message
      const newTotal = existingParticipants.length + successCount;
      const finalMessage = `🎉 **Teilnehmer erfolgreich hinzugefügt!**

📝 **Event:** ${event.title}
📅 **Datum:** ${event.date} um ${event.time} Uhr
🆔 **Event ID:** ${eventId}

📊 **Hinzufügungs-Statistik:**
✅ ${successCount} neue Teilnehmer erfolgreich hinzugefügt
${failCount > 0 ? `❌ ${failCount} Einladungen fehlgeschlagen` : '✨ Alle Einladungen erfolgreich!'}
📈 **Teilnehmer gesamt:** ${newTotal} (vorher: ${existingParticipants.length})${rolesSummary}${failedSummary}${warningsSummary}

🔔 **Nächste Schritte:**
• Neue Teilnehmer erhalten DMs mit Antwortmöglichkeiten
• Status wird automatisch im Channel aktualisiert
• Event-Nachricht zeigt die neuen Teilnehmer an

💡 **Tipp:** Mit \`/removeuser eventid:${eventId}\` können Teilnehmer wieder entfernt werden.`;

      await interaction.editReply({ content: finalMessage });
      
      console.log(`✅ AddUser completed: ${eventId} | Added: ${successCount} | Failed: ${failCount} | Total: ${newTotal}`);
      
    } catch (mainError) {
      console.error("Critical error in adduser command:", mainError);
      
      try {
        const errorMessage = mainError instanceof Error ? mainError.message : 'Unbekannter Fehler';
        const response = `❌ **Kritischer Fehler aufgetreten**\n\n\`\`\`${errorMessage}\`\`\`\n\n🔧 **Hilfe:**\n• Prüfe die Event-ID\n• Stelle sicher, dass das Event aktiv ist\n• Versuche es später erneut\n• Kontaktiere den Support falls das Problem bestehen bleibt`;
        
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