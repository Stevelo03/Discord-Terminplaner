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
        
        for (const roleId of roleIds) {
          try {
            const role = await interaction.guild.roles.fetch(roleId);
            if (!role) {
              console.log(`Rolle mit ID ${roleId} nicht gefunden`);
              continue;
            }
            
            processedRoleNames.push(role.name);
            console.log(`Verarbeite Rolle: ${role.name} mit ${role.members.size} Mitgliedern`);
            
            // Hole alle Mitglieder der Rolle
            await interaction.guild.members.fetch(); // Wichtig: Lade alle Guild-Mitglieder neu
            
            // Holen der Rolle erneut nach dem Neuladen aller Mitglieder
            const refreshedRole = await interaction.guild.roles.fetch(roleId);
            if (!refreshedRole) continue;
            
            // Channel für Berechtigungsprüfung
            const channel = interaction.channel as TextChannel;
            
            // Verarbeite alle Mitglieder der Rolle
            for (const [memberId, member] of refreshedRole.members) {
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
      
      // Event erstellen
      const eventId = await createEvent(
        title,
        date,
        time,
        interaction.user.id,
        allUserIds,
        interaction.channel as TextChannel,
        relativeDate,
        comment
      );
      
      // Teilnehmer einladen
      let successCount = 0;
      let failCount = 0;
      let failedUsernames: string[] = [];
      
      for (const userId of allUserIds) {
        try {
          const user = await interaction.client.users.fetch(userId);
          // ÄNDERUNG: Fange den Rückgabewert auf
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
          } else {
            failCount++;
            failedUsernames.push(user.username);
          }
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
        `Terminsuche erstellt!\n` +
        `✅ ${successCount} Teilnehmer erfolgreich eingeladen.\n` +
        (failCount > 0 ? `❌ ${failCount} Einladungen konnten nicht gesendet werden.${failedSummary}` : '') +
        rolesSummary
      );
    } catch (mainError) {
      console.error("Unerwarteter Fehler im Terminbefehl:", mainError);
      
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