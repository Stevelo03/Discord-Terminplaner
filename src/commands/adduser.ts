import { SlashCommandBuilder } from 'discord.js';
import { ChatInputCommandInteraction, TextChannel, PermissionFlagsBits } from 'discord.js';
import terminManager, { loadEvents, saveEvents } from '../terminManager';

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
        console.log(`Verarbeite ${roleIds.length} Rollen...`);
        
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
            
            // Channel für Berechtigungsprüfung
            const channel = await interaction.guild.channels.fetch(event.channelId) as TextChannel;
            
            // Verarbeite alle Mitglieder der Rolle
            for (const [memberId, member] of role.members) {
              console.log(`Prüfe Mitglied: ${member.user.username}`);
              
              // Überspringe, wenn Benutzer bereits in der Liste ist
              if (userIds.includes(memberId) || userIdsFromRoles.includes(memberId)) {
                console.log(`- Benutzer ${member.user.username} bereits in der Liste`);
                continue;
              }
              
              // Prüfe, ob das Mitglied den Channel sehen kann
              if (channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)) {
                console.log(`- Benutzer ${member.user.username} hat Sichtbarkeit und wird hinzugefügt`);
                userIdsFromRoles.push(memberId);
              } else {
                console.log(`- Benutzer ${member.user.username} hat keine Sichtbarkeit`);
              }
            }
          } catch (error) {
            console.error(`Fehler beim Verarbeiten der Rolle ${roleId}:`, error);
          }
        }
      }
      
      // Alle Benutzer-IDs kombinieren (ohne Duplikate)
      const allUserIds = [...new Set([...userIds, ...userIdsFromRoles])];
      console.log(`Gesamtzahl der einzuladenden Benutzer: ${allUserIds.length}`);
      
      if (allUserIds.length === 0) {
        await interaction.editReply({ content: "Bitte gib mindestens einen gültigen Teilnehmer oder eine Rolle an." });
        return;
      }
      
      // Bereits vorhandene Teilnehmer filtern
      const existingUserIds = event.participants.map(p => p.userId);
      const newUserIds = allUserIds.filter(id => !existingUserIds.includes(id));
      
      if (newUserIds.length === 0) {
        await interaction.editReply({ content: "Alle angegebenen Teilnehmer sind bereits Teil dieser Terminsuche." });
        return;
      }
      
      // Teilnehmer einladen
      let successCount = 0;
      let failCount = 0;
      let failedUsernames: string[] = [];
      
      for (const userId of newUserIds) {
        try {
          const user = await interaction.client.users.fetch(userId);
          await terminManager.inviteParticipant(
            eventId, 
            user, 
            event.title, 
            event.date, 
            event.time, 
            event.relativeDate, 
            event.comment
          );
          successCount++;
        } catch (error) {
          console.error(`Fehler beim Einladen von Benutzer ${userId}:`, error);
          failCount++;
          
          try {
            const user = await interaction.client.users.fetch(userId);
            failedUsernames.push(user.username);
          } catch {
            failedUsernames.push(`ID:${userId}`);
          }
        }
      }
      
      // Erstelle Zusammenfassung über eingeladene Rollen
      let rolesSummary = "";
      if (processedRoleNames.length > 0) {
        rolesSummary = `\nEingeladene Rollen: ${processedRoleNames.join(', ')}`;
      }
      
      // Erstelle Zusammenfassung über fehlgeschlagene Einladungen
      let failedSummary = "";
      if (failedUsernames.length > 0) {
        failedSummary = `\nFehlgeschlagene Einladungen: ${failedUsernames.join(', ')}`;
      }
      
      await interaction.editReply(
        `Teilnehmer zur Terminsuche "${event.title}" hinzugefügt!\n` +
        `✅ ${successCount} neue Teilnehmer erfolgreich eingeladen.\n` +
        (failCount > 0 ? `❌ ${failCount} Einladungen konnten nicht gesendet werden.${failedSummary}` : '') +
        rolesSummary
      );
      
      // Aktualisiere die Event-Nachricht im Server
      await terminManager.updateEventMessage(eventId);
    } catch (mainError) {
      console.error("Unerwarteter Fehler im adduser-Befehl:", mainError);
      
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