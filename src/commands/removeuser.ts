// src/commands/removeuser.ts
import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommandInteraction, TextChannel, PermissionFlagsBits } from 'discord.js';
import { db } from '../db';
import { events, participants, serverUsers, eventAuditLogs } from '../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { updateEventMessage } from '../terminManager';

// Helper function to create audit log
async function createAuditLog(eventId: string, action: string, performedBy: string, details?: any): Promise<void> {
  try {
    await db.insert(eventAuditLogs).values({
      eventId: eventId,
      action: action as any,
      performedBy: performedBy,
      performedAt: new Date(),
      details: details ? JSON.stringify(details) : null
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeuser')
    .setDescription('Entfernt Benutzer aus einer existierenden Terminsuche')
    .addStringOption(option => 
      option.setName('eventid')
        .setDescription('Die Event-ID der Terminsuche (z.B. aus dem Footer der Nachricht)')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('teilnehmer')
        .setDescription('Zu entfernende Teilnehmer oder Rollen (@user1, @rolle1)')
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
        await interaction.editReply({ content: "❌ **Teilnehmer erforderlich**\n\nBitte erwähne mindestens einen Benutzer oder eine Rolle zum Entfernen." });
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
        content: `🔄 **Verarbeite zu entfernende Teilnehmer...**\n\n📝 **Event:** ${event.title}\n📅 **Datum:** ${event.date} ${event.time}\n\n⏳ Analysiere Benutzer und Rollen...` 
      });
      
      // Aktuelle Teilnehmer aus Database laden
      const currentParticipants = await db.query.participants.findMany({
        where: eq(participants.eventId, eventId),
        with: {
          serverUser: true
        }
      });
      
      if (currentParticipants.length === 0) {
        await interaction.editReply({ 
          content: `ℹ️ **Keine Teilnehmer vorhanden**\n\nDieses Event hat aktuell keine Teilnehmer.\n\n💡 **Tipp:** Verwende \`/adduser\` um Teilnehmer hinzuzufügen.` 
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
        console.log(`Processing ${roleIds.length} roles for removal...`);
        
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
              console.log(`Processing role for removal: ${role.name} with ${role.members.size} members`);
              
              // Verarbeite alle Mitglieder der Rolle
              for (const [memberId, member] of role.members) {
                console.log(`Checking member for removal: ${member.user.username}`);
                
                // Überspringe, wenn Benutzer bereits in der Liste ist
                if (userIds.includes(memberId) || userIdsFromRoles.includes(memberId)) {
                  console.log(`- User ${member.user.username} already in removal list`);
                  continue;
                }
                
                // Prüfe, ob der Benutzer überhaupt Teilnehmer ist
                const isParticipant = currentParticipants.some(p => p.serverUser.userId === memberId);
                if (isParticipant) {
                  console.log(`- User ${member.user.username} will be added to removal list`);
                  userIdsFromRoles.push(memberId);
                } else {
                  console.log(`- User ${member.user.username} is not a participant`);
                }
              }
            } catch (error) {
              console.error(`Error processing role ${roleId} for removal:`, error);
              await interaction.followUp({ 
                content: `⚠️ **Warnung:** Fehler beim Verarbeiten der Rolle mit ID \`${roleId}\`.`, 
                ephemeral: true 
              });
            }
          }
        } catch (error) {
          console.error('Error fetching guild members for removal:', error);
          await interaction.editReply({ 
            content: "❌ **Fehler beim Laden der Servermitglieder**\n\nBitte versuche es später erneut." 
          });
          return;
        }
      }
      
      // Alle Benutzer-IDs kombinieren (ohne Duplikate)
      const allUserIds = [...new Set([...userIds, ...userIdsFromRoles])];
      console.log(`Total users to remove: ${allUserIds.length}`);
      
      if (allUserIds.length === 0) {
        await interaction.editReply({ 
          content: "❌ **Keine gültigen Teilnehmer zum Entfernen**\n\nBitte erwähne mindestens einen gültigen Benutzer oder eine Rolle.\n\n💡 **Beispiel:** `@Nutzer1 @TeamRolle`" 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `🔄 **Prüfe zu entfernende Teilnehmer...**\n\n📝 **Event:** ${event.title}\n👥 **Zu prüfen:** ${allUserIds.length} Benutzer${processedRoleNames.length > 0 ? `\n🏷️ **Rollen:** ${processedRoleNames.join(', ')}` : ''}\n📊 **Aktuelle Teilnehmer:** ${currentParticipants.length}\n\n⏳ Filtere tatsächliche Teilnehmer...` 
        });
      
      // Finde Teilnehmer, die tatsächlich entfernt werden können
      const participantsToRemove = currentParticipants.filter(participant => 
        allUserIds.includes(participant.serverUser.userId)
      );
      
      if (participantsToRemove.length === 0) {
        const currentUsernames = currentParticipants.map(p => p.serverUser.username).join(', ');
        await interaction.editReply({ 
          content: `ℹ️ **Keine zu entfernenden Teilnehmer**\n\nKeiner der angegebenen Benutzer ist Teil dieser Terminsuche.\n\n👥 **Aktuelle Teilnehmer:** ${currentUsernames}\n\n💡 **Tipp:** Prüfe die Teilnehmerliste in der Event-Nachricht.` 
        });
        return;
      }
      
      // Progress update
      await interaction.editReply({ 
        content: `✅ **Beginne Entfernung...**\n\n📝 **Event:** ${event.title}\n👥 **Zu entfernen:** ${participantsToRemove.length} von ${currentParticipants.length} Teilnehmern\n\n⏳ Entferne Teilnehmer aus der Datenbank...` 
      });
      
      // Sammle Informationen über entfernte Benutzer für Logging
      const removedUserInfo = participantsToRemove.map(p => ({
        participantId: p.id,
        userId: p.serverUser.userId,
        username: p.serverUser.username,
        status: p.currentStatus
      }));
      
      // Entferne Teilnehmer aus Database
      const participantIdsToRemove = participantsToRemove.map(p => p.id);
      
      try {
        // Atomare Transaktion: Teilnehmer entfernen und Audit-Log erstellen
        await db.transaction(async (tx: typeof db) => {
          await tx.delete(participants)
            .where(inArray(participants.id, participantIdsToRemove));

          await tx.insert(eventAuditLogs).values({
            eventId: eventId,
            action: 'PARTICIPANT_REMOVED' as any,
            performedBy: interaction.user.id,
            performedAt: new Date(),
            details: JSON.stringify({
              removedCount: participantsToRemove.length,
              removedUsers: removedUserInfo,
              performedBy: interaction.user.username,
              roleNames: processedRoleNames
            })
          });
        });

        console.log(`✅ Successfully removed ${participantsToRemove.length} participants from database`);

        // Update event message
        await updateEventMessage(eventId);

      } catch (dbError) {
        console.error('Database error during participant removal:', dbError);
        await interaction.editReply({
          content: `❌ **Datenbank-Fehler**\n\nFehler beim Entfernen der Teilnehmer. Bitte versuche es erneut.`
        });
        return;
      }
      
      // Erstelle Zusammenfassung über entfernte Rollen
      let rolesSummary = "";
      if (processedRoleNames.length > 0) {
        rolesSummary = `\n🏷️ **Verarbeitete Rollen:** ${processedRoleNames.join(', ')}`;
      }
      
      // Erstelle detaillierte Benutzer-Zusammenfassung
      let usersSummary = "";
      if (removedUserInfo.length > 0) {
        if (removedUserInfo.length <= 10) {
          usersSummary = `\n\n👥 **Entfernte Teilnehmer:**\n${removedUserInfo.map(user => {
            const statusEmoji = {
              'PENDING': '⏳',
              'ACCEPTED': '✅',
              'ACCEPTED_WITH_RESERVATION': '☑️',
              'ACCEPTED_WITHOUT_TIME': '⏱️',
              'OTHER_TIME': '🕒',
              'DECLINED': '❌'
            };
            return `• ${user.username} (${statusEmoji[user.status as keyof typeof statusEmoji] || '❓'} ${user.status})`;
          }).join('\n')}`;
        } else {
          usersSummary = `\n\n👥 **Entfernte Teilnehmer:** ${removedUserInfo.length} (siehe Logs für Details)`;
        }
      }
      
      // Berechne Statistiken
      const remainingParticipants = currentParticipants.length - participantsToRemove.length;
      const notFoundCount = allUserIds.length - participantsToRemove.length;
      
      // Warnings für nicht gefundene Benutzer
      let warningsSummary = "";
      if (notFoundCount > 0) {
        warningsSummary = `\n\n💡 **Hinweise:**`;
        warningsSummary += `\n• ${notFoundCount} der angegebenen Benutzer waren nicht Teil des Events`;
      }
      
      // Final success message
      const finalMessage = `🎉 **Teilnehmer erfolgreich entfernt!**

📝 **Event:** ${event.title}
📅 **Datum:** ${event.date} ${event.time}
🆔 **Event ID:** ${eventId}

📊 **Entfernungs-Statistik:**
✅ ${participantsToRemove.length} Teilnehmer erfolgreich entfernt
📉 **Teilnehmer gesamt:** ${remainingParticipants} (vorher: ${currentParticipants.length})${rolesSummary}${usersSummary}${warningsSummary}

🔔 **Nächste Schritte:**
• Event-Nachricht wurde automatisch aktualisiert
• Entfernte Teilnehmer können nicht mehr auf das Event antworten
• Die Teilnehmerliste zeigt nur noch verbleibende Personen

💡 **Tipp:** Mit \`/adduser eventid:${eventId}\` können neue Teilnehmer hinzugefügt werden.`;

      await interaction.editReply({ content: finalMessage });
      
      console.log(`✅ RemoveUser completed: ${eventId} | Removed: ${participantsToRemove.length} | Remaining: ${remainingParticipants}`);
      
    } catch (mainError) {
      console.error("Critical error in removeuser command:", mainError);
      
      try {
        const errorMessage = mainError instanceof Error ? mainError.message : 'Unbekannter Fehler';
        const response = `❌ **Kritischer Fehler aufgetreten**\n\n\`\`\`${errorMessage}\`\`\`\n\n🔧 **Hilfe:**\n• Prüfe die Event-ID\n• Stelle sicher, dass das Event aktiv ist\n• Stelle sicher, dass die Benutzer Teilnehmer sind\n• Versuche es später erneut\n• Kontaktiere den Support falls das Problem bestehen bleibt`;
        
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