import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommandInteraction, TextChannel, PermissionFlagsBits } from 'discord.js';
import terminManager, { loadEvents, saveEvents } from '../terminManager';

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
        await interaction.reply({ content: "Du hast keine Berechtigung, diesen Befehl zu nutzen.", ephemeral: true });
        return;
      }
      
      const eventId = interaction.options.getString('eventid') || '';
      const participantsString = interaction.options.getString('teilnehmer') || '';
      
      await interaction.deferReply({ ephemeral: true });
      
      // Event laden
      const events = loadEvents();
      const eventIndex = events.findIndex(e => e.id === eventId);
      
      if (eventIndex === -1) {
        await interaction.editReply({ content: `Kein Event mit der ID ${eventId} gefunden.` });
        return;
      }
      
      const event = events[eventIndex];
      
      // Prüfen, ob das Event noch aktiv ist
      if (event.status !== 'active') {
        await interaction.editReply({ 
          content: `Diese Terminsuche hat den Status "${event.status}". Du kannst nur aktive Terminsuchen bearbeiten.`
        });
        return;
      }
      
      // Überprüfen, ob die Interaktion in einem Server stattfindet
      if (!interaction.guild) {
        await interaction.editReply({ content: "Dieser Befehl kann nur auf einem Server ausgeführt werden." });
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
        console.log(`Verarbeite ${roleIds.length} Rollen für die Entfernung...`);
        
        // Hole alle Mitglieder der Guild
        await interaction.guild.members.fetch();
        
        for (const roleId of roleIds) {
          try {
            const role = await interaction.guild.roles.fetch(roleId);
            if (!role) {
              console.log(`Rolle mit ID ${roleId} nicht gefunden`);
              continue;
            }
            
            processedRoleNames.push(role.name);
            console.log(`Verarbeite Rolle: ${role.name} mit ${role.members.size} Mitgliedern`);
            
            // Verarbeite alle Mitglieder der Rolle
            for (const [memberId, member] of role.members) {
              console.log(`Prüfe Mitglied für Entfernung: ${member.user.username}`);
              
              // Überspringe, wenn Benutzer bereits in der Liste ist
              if (userIds.includes(memberId) || userIdsFromRoles.includes(memberId)) {
                console.log(`- Benutzer ${member.user.username} bereits in der Entfernungsliste`);
                continue;
              }
              
              console.log(`- Benutzer ${member.user.username} wird zur Entfernungsliste hinzugefügt`);
              userIdsFromRoles.push(memberId);
            }
          } catch (error) {
            console.error(`Fehler beim Verarbeiten der Rolle ${roleId} für die Entfernung:`, error);
          }
        }
      }
      
      // Alle Benutzer-IDs kombinieren (ohne Duplikate)
      const allUserIds = [...new Set([...userIds, ...userIdsFromRoles])];
      console.log(`Gesamtzahl der zu entfernenden Benutzer: ${allUserIds.length}`);
      
      if (allUserIds.length === 0) {
        await interaction.editReply({ content: "Bitte gib mindestens einen gültigen Teilnehmer oder eine Rolle an." });
        return;
      }
      
      // Sammle Informationen über entfernte Benutzer
      let removedCount = 0;
      const removedUsernames: string[] = [];
      
      // Teilnehmer entfernen
      const originalParticipantsLength = event.participants.length;
      event.participants = event.participants.filter(p => {
        // Wenn der Teilnehmer in der Entfernungsliste ist
        if (allUserIds.includes(p.userId)) {
          try {
            // Versuche den Benutzernamen zu speichern
            const username = p.username || `ID:${p.userId}`;
            removedUsernames.push(username);
            return false; // Entfernen
          } catch {
            return false; // Bei Fehler trotzdem entfernen
          }
        }
        return true; // Behalten, wenn nicht in der Liste zum Entfernen
      });
      
      // Anzahl der entfernten Teilnehmer berechnen
      removedCount = originalParticipantsLength - event.participants.length;
      
      if (removedCount === 0) {
        await interaction.editReply({ content: "Keiner der angegebenen Teilnehmer ist Teil dieser Terminsuche." });
        return;
      }
      
      // Aktualisiertes Event speichern
      events[eventIndex] = event;
      saveEvents(events);
      
      // Erstelle Zusammenfassung über entfernte Rollen
      let rolesSummary = "";
      if (processedRoleNames.length > 0) {
        rolesSummary = `\nEntfernte Rollen: ${processedRoleNames.join(', ')}`;
      }
      
      // Erstelle Zusammenfassung über entfernte Benutzer
      let usersSummary = "";
      if (removedUsernames.length > 0 && removedUsernames.length <= 10) {
        usersSummary = `\nEntfernte Benutzer: ${removedUsernames.join(', ')}`;
      } else if (removedUsernames.length > 10) {
        // Wenn zu viele Benutzer entfernt wurden, zeige nur die ersten 10
        usersSummary = `\nEntfernte Benutzer: ${removedUsernames.slice(0, 10).join(', ')} und ${removedUsernames.length - 10} weitere`;
      }
      
      await interaction.editReply(
        `Teilnehmer aus der Terminsuche "${event.title}" entfernt!\n` +
        `✅ ${removedCount} Teilnehmer erfolgreich entfernt.` +
        rolesSummary +
        usersSummary
      );
      
      // Aktualisiere die Event-Nachricht im Server
      await terminManager.updateEventMessage(eventId);
    } catch (mainError) {
      console.error("Unerwarteter Fehler im removeuser-Befehl:", mainError);
      
      try {
        if (interaction.deferred) {
          await interaction.editReply({ content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut." });
        } else {
          await interaction.reply({ content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.", ephemeral: true });
        }
      } catch (e) {
        console.error("Fehler bei der Fehlermeldung:", e);
      }
    }
  },
};