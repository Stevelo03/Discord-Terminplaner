// src/terminManager.ts
import { 
  ButtonInteraction, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  User, 
  TextChannel, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ModalSubmitInteraction 
} from 'discord.js';
import { db } from './db';
import { 
  servers, 
  serverUsers, 
  events, 
  participants, 
  responseHistory, 
  eventAuditLogs 
} from './db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';

// Ensure server exists in database
async function ensureServer(serverId: string, serverName: string): Promise<void> {
  try {
    const existingServer = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    
    if (existingServer.length === 0) {
      await db.insert(servers).values({
        id: serverId,
        name: serverName,
        createdAt: new Date(),
        lastActivityAt: new Date()
      });
      console.log(`✅ Created server: ${serverName}`);
    } else {
      await db.update(servers)
        .set({ 
          name: serverName, // Update name in case it changed
          lastActivityAt: new Date() 
        })
        .where(eq(servers.id, serverId));
    }
  } catch (error) {
    console.error('Error ensuring server:', error);
    throw error;
  }
}

// Ensure server user exists in database
async function ensureServerUser(serverId: string, userId: string, username: string, displayName?: string): Promise<number> {
  try {
    const existingUser = await db.select()
      .from(serverUsers)
      .where(and(eq(serverUsers.serverId, serverId), eq(serverUsers.userId, userId)))
      .limit(1);
    
    if (existingUser.length === 0) {
      const [newUser] = await db.insert(serverUsers).values({
        serverId: serverId,
        userId: userId,
        username: username,
        displayName: displayName,
        totalInvites: 0,
        totalResponses: 0,
        firstSeenAt: new Date(),
        lastActiveAt: new Date()
      }).returning();
      
      console.log(`✅ Created server user: ${username}`);
      return newUser.id;
    } else {
      await db.update(serverUsers)
        .set({ 
          username: username,
          displayName: displayName,
          lastActiveAt: new Date() 
        })
        .where(eq(serverUsers.id, existingUser[0].id));
      
      return existingUser[0].id;
    }
  } catch (error) {
    console.error('Error ensuring server user:', error);
    throw error;
  }
}

// Create audit log entry
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

// Create response history entry
async function createResponseHistory(
  participantId: number, 
  oldStatus: string | null, 
  newStatus: string, 
  responseTimeSeconds?: number, 
  alternativeTime?: string,
  responseContext: 'INITIAL' | 'AFTER_REMINDER' | 'AFTER_START_REMINDER' | 'LAST_MINUTE' = 'INITIAL',
  hoursBeforeEvent?: number
): Promise<void> {
  try {
    await db.insert(responseHistory).values({
      participantId: participantId,
      oldStatus: oldStatus as any,
      newStatus: newStatus as any,
      changedAt: new Date(),
      responseTimeSeconds: responseTimeSeconds,
      alternativeTime: alternativeTime,
      responseContext: responseContext,
      hoursBeforeEvent: hoursBeforeEvent
    });
  } catch (error) {
    console.error('Error creating response history:', error);
  }
}

// Calculate hours before event
function calculateHoursBeforeEvent(eventDate: string, eventTime: string): number {
  try {
    // Parse event date and time
    const [day, month, year] = eventDate.split('.');
    const [hours, minutes] = eventTime.split(':');
    
    const eventDateTime = new Date(
      parseInt(year), 
      parseInt(month) - 1, 
      parseInt(day), 
      parseInt(hours), 
      parseInt(minutes)
    );
    
    const now = new Date();
    const diffMs = eventDateTime.getTime() - now.getTime();
    const hoursBeforeEvent = diffMs / (1000 * 60 * 60);
    
    return Math.max(0, hoursBeforeEvent);
  } catch (error) {
    console.error('Error calculating hours before event:', error);
    return 0;
  }
}

// Get server user ID helper
async function getServerUserId(serverId: string, userId: string): Promise<number | null> {
  try {
    const serverUser = await db.select({ id: serverUsers.id })
      .from(serverUsers)
      .where(and(
        eq(serverUsers.serverId, serverId),
        eq(serverUsers.userId, userId)
      ))
      .limit(1);
    
    return serverUser.length > 0 ? serverUser[0].id : null;
  } catch (error) {
    console.error('Error getting server user ID:', error);
    return null;
  }
}

// Neues Event erstellen
export async function createEvent(
  title: string,
  date: string,
  time: string,
  organizerId: string,
  participantUserIds: string[],
  channel: TextChannel,
  relativeDate?: string | null,
  comment?: string | null
): Promise<string> {
  try {
    const serverId = channel.guildId;
    const serverName = channel.guild.name;
    
    // Ensure server exists
    await ensureServer(serverId, serverName);
    
    // Generate event ID
    const eventId = Date.now().toString();
    
    // Parse date for queries (optional)
    let parsedDate: Date | null = null;
    try {
      const [day, month, year] = date.split('.');
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    } catch (error) {
      console.warn('Could not parse date:', date);
    }
    
    // Ensure organizer exists
    const organizer = await channel.guild.members.fetch(organizerId);
    await ensureServerUser(serverId, organizerId, organizer.user.username, organizer.displayName);
    
    // Create embed for server channel
    const serverEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Terminplanung: ${title}`)
      .setDescription(`Termin für ${date} um ${time} Uhr.${relativeDate ? `\nDas ist ${relativeDate}` : ''}${comment ? `\n\n**Kommentar:** ${comment}` : ''}\n`)
      .setTimestamp()
      .setFooter({ text: `Event ID: ${eventId} • Status: Aktiv` });
    
    // Admin buttons
    const adminButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`manage:${eventId}:remind`)
          .setLabel('Erinnerung senden')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`manage:${eventId}:startReminder`)
          .setLabel('Termin Starterinnerung')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`manage:${eventId}:cancel`)
          .setLabel('Terminsuche abbrechen')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`manage:${eventId}:close`)
          .setLabel('Terminsuche schließen')
          .setStyle(ButtonStyle.Primary)
      );
    
    // Response buttons
    const responseButtons = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:accept`)
          .setLabel('Zusagen')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:acceptWithReservation`)
          .setLabel('Zusagen mit Vorbehalt')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:acceptNoTime`)
          .setLabel('Zusagen ohne Uhrzeitgarantie')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:otherTime`)
          .setLabel('Andere Uhrzeit')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:decline`)
          .setLabel('Absagen')
          .setStyle(ButtonStyle.Danger)
      );

    // Send message in server channel
    const message = await channel.send({
      embeds: [serverEmbed],
      components: [adminButtons, responseButtons]
    });
    
    // Create event in database
    await db.insert(events).values({
      id: eventId,
      serverId: serverId,
      title: title,
      date: date,
      time: time,
      parsedDate: parsedDate,
      relativeDate: relativeDate || null,
      comment: comment || null,
      channelId: channel.id,
      messageId: message.id,
      organizerId: organizerId,
      status: 'ACTIVE',
      remindersSent: 0,
      createdAt: new Date()
    });
    
    // Create audit log
    await createAuditLog(eventId, 'EVENT_CREATED', organizerId, {
      title,
      date,
      time,
      participantCount: participantUserIds.length
    });
    
    console.log(`✅ Event created: ${eventId}`);
    return eventId;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

// DM an Teilnehmer senden
export async function inviteParticipant(
  eventId: string,
  user: User,
  title: string,
  date: string,
  time: string,
  relativeDate?: string | null,
  comment?: string | null
): Promise<boolean> {
  try {
    // Get event from database
    const eventData = await db.select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    
    if (eventData.length === 0) {
      console.error(`Event ${eventId} not found`);
      return false;
    }
    
    const event = eventData[0];
    
    // Ensure server user exists
    const serverUserId = await ensureServerUser(event.serverId, user.id, user.username);
    
    // Check if participant already exists
    const existingParticipant = await db.select()
      .from(participants)
      .where(and(eq(participants.eventId, eventId), eq(participants.serverUserId, serverUserId)))
      .limit(1);
    
    if (existingParticipant.length > 0) {
      console.log(`Participant ${user.username} already exists for event ${eventId}`);
      return true;
    }
    
    // Create participant
    const [newParticipant] = await db.insert(participants).values({
      eventId: eventId,
      serverUserId: serverUserId,
      currentStatus: 'PENDING',
      invitedAt: new Date()
    }).returning();
    
    // Calculate response time context
    const hoursBeforeEvent = calculateHoursBeforeEvent(date, time);
    
    // Create initial response history
    await createResponseHistory(
      newParticipant.id, 
      null, 
      'PENDING', 
      0, // No response time yet
      undefined,
      'INITIAL',
      hoursBeforeEvent
    );
    
    // Create audit log
    await createAuditLog(eventId, 'PARTICIPANT_INVITED', user.id, {
      participantId: newParticipant.id,
      username: user.username
    });
    
    // Create DM embed
    let description = `Du wurdest eingeladen am ${date} an ${title} teilzunehmen, um ${time} Uhr.`;
    
    if (relativeDate) {
      description += `\nDas ist ${relativeDate}`;
    }
    
    if (comment) {
      description += `\n\n**Kommentar:** ${comment}`;
    }
    
    const dmEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Terminsuche: ${title}`)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: `Event ID: ${eventId}` });
    
    // DM buttons
    const dmRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:accept`)
          .setLabel('Zusagen')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:acceptWithReservation`)
          .setLabel('Zusagen mit Vorbehalt')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:acceptNoTime`)
          .setLabel('Zusagen ohne Uhrzeitgarantie')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:otherTime`)
          .setLabel('Andere Uhrzeit')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:decline`)
          .setLabel('Absagen')
          .setStyle(ButtonStyle.Danger)
      );
    
    try {
      // Send DM only if event is still active
      if (event.status === 'ACTIVE') {
        await user.send({
          embeds: [dmEmbed],
          components: [dmRow]
        });
      } else {
        await user.send({
          embeds: [dmEmbed],
          components: []
        });
      }
      
      // Update server user stats
      await db.update(serverUsers)
        .set({ 
          totalInvites: sql`${serverUsers.totalInvites} + 1`,
          lastActiveAt: new Date()
        })
        .where(eq(serverUsers.id, serverUserId));
      
      // Update event message
      await updateEventMessage(eventId);
      
      return true;
    } catch (error) {
      console.error(`Could not send DM to ${user.username}:`, error);
      
      // Remove participant if DM failed
      await db.delete(participants).where(eq(participants.id, newParticipant.id));
      
      return false;
    }
  } catch (error) {
    console.error('Error inviting participant:', error);
    return false;
  }
}

// Event-Nachricht im Server aktualisieren
export async function updateEventMessage(eventId: string): Promise<void> {
  try {
    // Get event with all related data
    const eventData = await db.query.events.findFirst({
      where: eq(events.id, eventId),
      with: {
        server: true,
        participants: {
          with: {
            serverUser: true,
            responseHistory: true
          }
        }
      }
    });
    
    if (!eventData) {
      console.error(`Event ${eventId} not found`);
      return;
    }
    
    const client = (await import('./index')).default.client;
    const channel = await client.channels.fetch(eventData.channelId) as TextChannel;
    
    if (!channel) {
      console.error(`Channel for event ${eventId} not found`);
      return;
    }
    
    try {
      const message = await channel.messages.fetch(eventData.messageId!);
      
      // Count status
      let acceptedCount = 0;
      let declinedCount = 0;
      let acceptedWithoutTimeCount = 0;
      let acceptedWithReservationCount = 0;
      let pendingCount = 0;
      let otherTimeCount = 0;
      
      // Build participants text
      let participantsText = "";
      for (const participant of eventData.participants) {
        let statusText: string;
        
        switch (participant.currentStatus) {
          case 'ACCEPTED':
            statusText = "✅ Zugesagt";
            acceptedCount++;
            break;
          case 'ACCEPTED_WITH_RESERVATION':
            statusText = "☑️ Zugesagt mit Vorbehalt";
            acceptedWithReservationCount++;
            break;
          case 'ACCEPTED_WITHOUT_TIME':
            statusText = "⏱️ Zugesagt ohne Uhrzeitgarantie";
            acceptedWithoutTimeCount++;
            break;
          case 'DECLINED':
            statusText = "❌ Abgesagt";
            declinedCount++;
            break;
          case 'OTHER_TIME':
            statusText = `🕒 Andere Uhrzeit: ${participant.alternativeTime}`;
            otherTimeCount++;
            break;
          default:
            statusText = "⏳ Warte auf Antwort";
            pendingCount++;
        }
        
        participantsText += `<@${participant.serverUser.userId}>: ${statusText}\n`;
      }
      
      const totalParticipants = eventData.participants.length;
      const statusSummary = `| ✅ ${acceptedCount} | ☑️ ${acceptedWithReservationCount} | ⏱️ ${acceptedWithoutTimeCount} | 🕒 ${otherTimeCount} | ❌ ${declinedCount} | ⏳ ${pendingCount} |`;
      
      if (participantsText === "") {
        participantsText = "Keine Teilnehmer eingeladen.";
      } else {
        participantsText += `\n${statusSummary}`;
      }
      
      // Status text with cancellation reason
      let statusText = eventData.status === 'ACTIVE' 
        ? 'Aktiv' 
        : eventData.status === 'CLOSED' 
          ? 'Geschlossen' 
          : 'Abgebrochen';
      
      if (eventData.status === 'CANCELLED' && eventData.cancellationReason) {
        statusText += ` (${eventData.cancellationReason})`;
      }
      
      // Description with optional relative date and comment
      let description = `Termin für ${eventData.date} um ${eventData.time} Uhr.`;
      
      if (eventData.relativeDate) {
        description += `\nDas ist ${eventData.relativeDate}`;
      }
      
      if (eventData.comment) {
        description += `\n\n**Kommentar:** ${eventData.comment}`;
      }
      
      description += `\n\nStatus der Teilnehmer:`;
      
      // Embed color based on status
      let embedColor = '#0099ff'; // Blue for active
      switch (eventData.status) {
        case 'ACTIVE':
          embedColor = '#0099ff';
          break;
        case 'CLOSED':
          embedColor = '#00ff00';
          break;
        case 'CANCELLED':
          embedColor = '#ff0000';
          break;
      }
      
      // Update embed
      const updatedEmbed = new EmbedBuilder()
        .setColor(embedColor as any)
        .setTitle(`Terminplanung: ${eventData.title}`)
        .setDescription(description)
        .addFields({ name: `Teilnehmer (${totalParticipants})`, value: participantsText })
        .setTimestamp()
        .setFooter({ text: `Event ID: ${eventData.id} • Status: ${statusText}` });
      
      // Update admin buttons
      const updatedAdminButtons = new ActionRowBuilder<ButtonBuilder>();
      
      if (eventData.status === 'ACTIVE') {
        updatedAdminButtons.addComponents(
          new ButtonBuilder()
            .setCustomId(`manage:${eventId}:remind`)
            .setLabel('Erinnerung senden')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`manage:${eventId}:startReminder`)
            .setLabel('Termin Starterinnerung')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`manage:${eventId}:cancel`)
            .setLabel('Terminsuche abbrechen')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`manage:${eventId}:close`)
            .setLabel('Terminsuche schließen')
            .setStyle(ButtonStyle.Primary)
        );
      }
      
      // Update response buttons
      const updatedResponseButtons = new ActionRowBuilder<ButtonBuilder>();
      
      if (eventData.status === 'ACTIVE') {
        updatedResponseButtons.addComponents(
          new ButtonBuilder()
            .setCustomId(`respond:${eventId}:accept`)
            .setLabel('Zusagen')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`respond:${eventId}:acceptWithReservation`)
            .setLabel('Zusagen mit Vorbehalt')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`respond:${eventId}:acceptNoTime`)
            .setLabel('Zusagen ohne Uhrzeitgarantie')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`respond:${eventId}:otherTime`)
            .setLabel('Andere Uhrzeit')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`respond:${eventId}:decline`)
            .setLabel('Absagen')
            .setStyle(ButtonStyle.Danger)
        );
      }
      
      const components = eventData.status === 'ACTIVE' 
        ? [updatedAdminButtons, updatedResponseButtons] 
        : [];
      
      await message.edit({
        embeds: [updatedEmbed],
        components: components
      });
    } catch (error) {
      console.error(`Error updating event message:`, error);
    }
  } catch (error) {
    console.error('Error in updateEventMessage:', error);
  }
}

// Response handling
export async function handleResponse(interaction: ButtonInteraction, eventId: string, response: string): Promise<void> {
  try {
    // Get event
    const eventData = await db.select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    
    if (eventData.length === 0) {
      await interaction.reply({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
      return;
    }
    
    const event = eventData[0];
    
    // Check if event is active
    if (event.status !== 'ACTIVE') {
      let statusMessage = `Diese Terminsuche wurde ${event.status === 'CLOSED' ? 'geschlossen' : 'abgebrochen'}.`;
      
      if (event.status === 'CANCELLED' && event.cancellationReason) {
        statusMessage += `\n\n**Grund:** ${event.cancellationReason}`;
      }
      
      await interaction.reply({ 
        content: statusMessage, 
        ephemeral: true 
      });
      return;
    }
    
    // Get server user ID
    const serverUserId = await getServerUserId(event.serverId, interaction.user.id);
    if (!serverUserId) {
      await interaction.reply({ content: "Du bist nicht zu diesem Termin eingeladen. Nur eingeladene Teilnehmer können antworten.", ephemeral: true });
      return;
    }
    
    // Get participant
    const participantData = await db.select()
      .from(participants)
      .where(and(
        eq(participants.eventId, eventId),
        eq(participants.serverUserId, serverUserId)
      ))
      .limit(1);
    
    if (participantData.length === 0) {
      await interaction.reply({ content: "Du bist nicht zu diesem Termin eingeladen. Nur eingeladene Teilnehmer können antworten.", ephemeral: true });
      return;
    }
    
    const participant = participantData[0];
    
    // Handle "other time" response
    if (response === 'otherTime') {
      await showAlternativeTimeModal(interaction, eventId);
      return;
    }
    
    // Update participant status
    const oldStatus = participant.currentStatus;
    let newStatus: string;
    let responseMessage = "";
    
    switch (response) {
      case 'accept':
        newStatus = 'ACCEPTED';
        responseMessage = `Danke für deine Zusage für "${event.title}" am ${event.date} um ${event.time} Uhr!`;
        break;
      case 'acceptWithReservation':
        newStatus = 'ACCEPTED_WITH_RESERVATION';
        responseMessage = `Danke für deine Zusage mit Vorbehalt für "${event.title}" am ${event.date} um ${event.time} Uhr!`;
        break;
      case 'acceptNoTime':
        newStatus = 'ACCEPTED_WITHOUT_TIME';
        responseMessage = `Danke für deine Zusage für "${event.title}" am ${event.date}! Du hast angegeben, dass du ohne Uhrzeitgarantie teilnimmst.`;
        break;
      case 'decline':
        newStatus = 'DECLINED';
        responseMessage = `Du hast für "${event.title}" am ${event.date} abgesagt.`;
        break;
      default:
        await interaction.reply({ content: "Unbekannte Antwort.", ephemeral: true });
        return;
    }
    
    // Update participant
    await db.update(participants)
      .set({ currentStatus: newStatus as any })
      .where(eq(participants.id, participant.id));
    
    // Calculate response metrics
    const responseTimeSeconds = Math.floor((Date.now() - participant.invitedAt.getTime()) / 1000);
    const hoursBeforeEvent = calculateHoursBeforeEvent(event.date, event.time);
    
    // Determine response context
    let responseContext: 'INITIAL' | 'AFTER_REMINDER' | 'AFTER_START_REMINDER' | 'LAST_MINUTE' = 'INITIAL';
    if (hoursBeforeEvent < 6) {
      responseContext = 'LAST_MINUTE';
    }
    // Note: 'AFTER_REMINDER' and 'AFTER_START_REMINDER' would be set in reminder functions
    
    // Create response history
    await createResponseHistory(
      participant.id, 
      oldStatus, 
      newStatus, 
      responseTimeSeconds,
      undefined,
      responseContext,
      hoursBeforeEvent
    );
    
    // Create audit log
    await createAuditLog(eventId, 'PARTICIPANT_RESPONDED', interaction.user.id, {
      participantId: participant.id,
      oldStatus,
      newStatus,
      responseTimeSeconds,
      hoursBeforeEvent
    });
    
    // Update user stats
    await db.update(serverUsers)
      .set({ 
        totalResponses: sql`${serverUsers.totalResponses} + 1`,
        lastActiveAt: new Date()
      })
      .where(eq(serverUsers.id, serverUserId));
    
    await updateEventMessage(eventId);
    await interaction.reply({ content: responseMessage, ephemeral: true });
  } catch (error) {
    console.error('Error handling response:', error);
    await interaction.reply({ content: "Ein Fehler ist aufgetreten.", ephemeral: true });
  }
}

// Show alternative time modal
export async function showAlternativeTimeModal(interaction: ButtonInteraction, eventId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`alternativeTime:${eventId}`)
    .setTitle('Alternative Uhrzeit angeben');
  
  const hourInput = new TextInputBuilder()
    .setCustomId('hourInput')
    .setLabel('Stunde (00-23)')
    .setPlaceholder('14')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);
  
  const minuteInput = new TextInputBuilder()
    .setCustomId('minuteInput')
    .setLabel('Minute (00-59)')
    .setPlaceholder('30')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);
  
  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(hourInput);
  const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(minuteInput);
  
  modal.addComponents(firstActionRow, secondActionRow);
  
  await interaction.showModal(modal);
}

// Handle alternative time modal
export async function handleAlternativeTime(
  interaction: ModalSubmitInteraction, 
  eventId: string
): Promise<void> {
  try {
    // Get event
    const eventData = await db.select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    
    if (eventData.length === 0) {
      await interaction.reply({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
      return;
    }
    
    const event = eventData[0];
    
    // Check if event is active
    if (event.status !== 'ACTIVE') {
      await interaction.reply({ 
        content: `Diese Terminsuche wurde ${event.status === 'CLOSED' ? 'geschlossen' : 'abgebrochen'}.`, 
        ephemeral: true 
      });
      return;
    }
    
    // Get server user ID
    const serverUserId = await getServerUserId(event.serverId, interaction.user.id);
    if (!serverUserId) {
      await interaction.reply({ content: "Du bist kein Teilnehmer dieses Events.", ephemeral: true });
      return;
    }
    
    // Get participant
    const participantData = await db.select()
      .from(participants)
      .where(and(
        eq(participants.eventId, eventId),
        eq(participants.serverUserId, serverUserId)
      ))
      .limit(1);
    
    if (participantData.length === 0) {
      await interaction.reply({ content: "Du bist kein Teilnehmer dieses Events.", ephemeral: true });
      return;
    }
    
    const participant = participantData[0];
    
    // Get and validate input
    const hourInput = interaction.fields.getTextInputValue('hourInput');
    const minuteInput = interaction.fields.getTextInputValue('minuteInput');
    
    if (!/^\d+$/.test(hourInput) || !/^\d+$/.test(minuteInput)) {
      await interaction.reply({ 
        content: "Bitte gib nur Zahlen für Stunde und Minute ein.", 
        ephemeral: true 
      });
      return;
    }
    
    const hour = parseInt(hourInput);
    const minute = parseInt(minuteInput);
    
    if (hour < 0 || hour > 23) {
      await interaction.reply({ 
        content: "Die Stunde muss zwischen 00 und 23 liegen.", 
        ephemeral: true 
      });
      return;
    }
    
    if (minute < 0 || minute > 59) {
      await interaction.reply({ 
        content: "Die Minute muss zwischen 00 und 59 liegen.", 
        ephemeral: true 
      });
      return;
    }
    
    const formattedTime = `ca. ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} Uhr`;
    
    // Update participant
    const oldStatus = participant.currentStatus;
    await db.update(participants)
      .set({ 
        currentStatus: 'OTHER_TIME',
        alternativeTime: formattedTime
      })
      .where(eq(participants.id, participant.id));
    
    // Calculate response metrics
    const responseTimeSeconds = Math.floor((Date.now() - participant.invitedAt.getTime()) / 1000);
    const hoursBeforeEvent = calculateHoursBeforeEvent(event.date, event.time);
    
    // Determine response context
    let responseContext: 'INITIAL' | 'AFTER_REMINDER' | 'AFTER_START_REMINDER' | 'LAST_MINUTE' = 'INITIAL';
    if (hoursBeforeEvent < 6) {
      responseContext = 'LAST_MINUTE';
    }
    
    // Create response history
    await createResponseHistory(
      participant.id, 
      oldStatus, 
      'OTHER_TIME', 
      responseTimeSeconds, 
      formattedTime,
      responseContext,
      hoursBeforeEvent
    );
    
    // Create audit log
    await createAuditLog(eventId, 'PARTICIPANT_RESPONDED', interaction.user.id, {
      participantId: participant.id,
      oldStatus,
      newStatus: 'OTHER_TIME',
      alternativeTime: formattedTime,
      responseTimeSeconds,
      hoursBeforeEvent
    });
    
    // Update user stats
    await db.update(serverUsers)
      .set({ 
        totalResponses: sql`${serverUsers.totalResponses} + 1`,
        lastActiveAt: new Date()
      })
      .where(eq(serverUsers.id, serverUserId));
    
    await updateEventMessage(eventId);
    await interaction.reply({ 
      content: `Danke für deine Antwort! Du hast für "${event.title}" am ${event.date} eine alternative Uhrzeit (${formattedTime}) angegeben.`, 
      ephemeral: true 
    });
  } catch (error) {
    console.error('Error handling alternative time:', error);
    await interaction.reply({ content: "Ein Fehler ist aufgetreten.", ephemeral: true });
  }
}

// Event schließen
export async function closeEvent(interaction: ButtonInteraction, eventId: string): Promise<void> {
  try {
    // Update event status
    await db.update(events)
      .set({ 
        status: 'CLOSED',
        closedAt: new Date()
      })
      .where(eq(events.id, eventId));
    
    // Create audit log
    await createAuditLog(eventId, 'EVENT_CLOSED', interaction.user.id);
    
    await updateEventMessage(eventId);
    await interaction.reply({ content: "Die Terminsuche wurde geschlossen.", ephemeral: true });
  } catch (error) {
    console.error('Error closing event:', error);
    await interaction.reply({ content: "Ein Fehler ist aufgetreten.", ephemeral: true });
  }
}

// Modal für Abbruchgrund anzeigen
export async function showCancelModal(interaction: ButtonInteraction, eventId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`cancelEvent:${eventId}`)
    .setTitle('Terminsuche abbrechen');
  
  const reasonInput = new TextInputBuilder()
    .setCustomId('reasonInput')
    .setLabel('Abbruchgrund (optional)')
    .setPlaceholder('z.B. "Organisator erkrankt" oder leer lassen...')
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(0)
    .setMaxLength(200)
    .setRequired(false);
  
  const notifyInput = new TextInputBuilder()
    .setCustomId('notifyInput')
    .setLabel('Benachrichtigung? (0 = Nein, 1 = Ja)')
    .setPlaceholder('0 oder 1')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(1)
    .setRequired(true);
  
  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
  const secondActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(notifyInput);
  
  modal.addComponents(firstActionRow, secondActionRow);
  
  await interaction.showModal(modal);
}

// Abbruch-Modal verarbeiten
export async function handleCancelEvent(
  interaction: ModalSubmitInteraction, 
  eventId: string
): Promise<void> {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Get event
    const eventData = await db.select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    
    if (eventData.length === 0) {
      await interaction.editReply({ content: "Dieses Event existiert nicht mehr." });
      return;
    }
    
    const event = eventData[0];
    
    // Get input
    const reasonInput = interaction.fields.getTextInputValue('reasonInput').trim();
    const notifyInput = interaction.fields.getTextInputValue('notifyInput').trim();
    
    // Validate notification option
    if (notifyInput !== '0' && notifyInput !== '1') {
      await interaction.editReply({ 
        content: "Bitte gib nur '0' (keine Benachrichtigung) oder '1' (Benachrichtigung senden) ein." 
      });
      return;
    }
    
    const shouldNotify = notifyInput === '1';
    
    // Update event status
    await db.update(events)
      .set({ 
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancellationReason: reasonInput || null
      })
      .where(eq(events.id, eventId));
    
    // Create audit log
    await createAuditLog(eventId, 'EVENT_CANCELLED', interaction.user.id, {
      reason: reasonInput,
      shouldNotify
    });
    
    let notificationCount = 0;
    let notificationErrors = 0;
    
    if (shouldNotify) {
      // Get participants with positive responses
      const participantsToNotify = await db.query.participants.findMany({
        where: and(
          eq(participants.eventId, eventId),
          inArray(participants.currentStatus, ['ACCEPTED', 'ACCEPTED_WITHOUT_TIME', 'ACCEPTED_WITH_RESERVATION', 'OTHER_TIME'])
        ),
        with: {
          serverUser: true
        }
      });
      
      if (participantsToNotify.length > 0) {
        let cancellationMessage = `Der Termin "${event.title}" am ${event.date} um ${event.time} Uhr wurde abgebrochen.`;
        
        if (reasonInput) {
          cancellationMessage += `\n\n**Grund:** ${reasonInput}`;
        }
        
        const cancellationEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle(`❌ Termin abgebrochen: ${event.title}`)
          .setDescription(cancellationMessage)
          .setTimestamp()
          .setFooter({ text: `Event ID: ${eventId}` });
        
        // Send notifications
        for (const participant of participantsToNotify) {
          try {
            const user = await interaction.client.users.fetch(participant.serverUser.userId);
            await user.send({ embeds: [cancellationEmbed] });
            notificationCount++;
          } catch (error) {
            console.error(`Could not send cancellation notification to ${participant.serverUser.username}:`, error);
            notificationErrors++;
          }
        }
      }
    }
    
    await updateEventMessage(eventId);
    
    // Response to admin
    let responseMessage = `Die Terminsuche "${event.title}" wurde erfolgreich abgebrochen.`;
    
    if (reasonInput) {
      responseMessage += `\n**Grund:** ${reasonInput}`;
    }
    
    if (shouldNotify) {
      responseMessage += `\n\n📧 **Benachrichtigungen:**`;
      responseMessage += `\n✅ ${notificationCount} Teilnehmer benachrichtigt`;
      if (notificationErrors > 0) {
        responseMessage += `\n❌ ${notificationErrors} Benachrichtigungen fehlgeschlagen`;
      }
    }
    
    await interaction.editReply({ content: responseMessage });
  } catch (error) {
    console.error('Error cancelling event:', error);
    
    try {
      if (interaction.deferred) {
        await interaction.editReply({ content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut." });
      } else {
        await interaction.reply({ content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.", ephemeral: true });
      }
    } catch (e) {
      console.error("Error with error message:", e);
    }
  }
}

// Erinnerung an nicht antwortende Teilnehmer senden
export async function sendReminders(interaction: ButtonInteraction, eventId: string): Promise<void> {
  try {
    await interaction.reply({ 
      content: "Sende Erinnerungen an Teilnehmer ohne Antwort...", 
      ephemeral: true 
    });

    // Get event with pending participants
    const eventData = await db.query.events.findFirst({
      where: eq(events.id, eventId),
      with: {
        participants: {
          where: eq(participants.currentStatus, 'PENDING'),
          with: {
            serverUser: true
          }
        }
      }
    });
    
    if (!eventData) {
      await interaction.followUp({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
      return;
    }
    
    // Check if event is active
    if (eventData.status !== 'ACTIVE') {
      await interaction.followUp({ 
        content: `Diese Terminsuche wurde ${eventData.status === 'CLOSED' ? 'geschlossen' : 'abgebrochen'}.`, 
        ephemeral: true 
      });
      return;
    }
    
    const pendingParticipants = eventData.participants;
    
    if (pendingParticipants.length === 0) {
      await interaction.followUp({ 
        content: "Es gibt keine Teilnehmer, die noch nicht geantwortet haben.", 
        ephemeral: true 
      });
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    // Create reminder description
    let reminderDescription = `Erinnerung: Du wurdest eingeladen am ${eventData.date} an ${eventData.title} teilzunehmen, um ${eventData.time} Uhr.`;
    
    if (eventData.relativeDate) {
      reminderDescription += `\nDas ist ${eventData.relativeDate}`;
    }
    
    if (eventData.comment) {
      reminderDescription += `\n\n**Kommentar:** ${eventData.comment}`;
    }
    
    reminderDescription += `\n\n**Bitte antworte auf die Einladung.**`;
    
    // Create reminder embed
    const reminderEmbed = new EmbedBuilder()
      .setColor('#FFA500')
      .setTitle(`Erinnerung: Terminsuche ${eventData.title}`)
      .setDescription(reminderDescription)
      .setTimestamp()
      .setFooter({ text: `Event ID: ${eventId}` });
    
    // Reminder buttons
    const reminderRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:accept`)
          .setLabel('Zusagen')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:acceptWithReservation`)
          .setLabel('Zusagen mit Vorbehalt')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:acceptNoTime`)
          .setLabel('Zusagen ohne Uhrzeitgarantie')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:otherTime`)
          .setLabel('Andere Uhrzeit')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:decline`)
          .setLabel('Absagen')
          .setStyle(ButtonStyle.Danger)
      );
    
    // Send reminders and track response context for future responses
    for (const participant of pendingParticipants) {
      try {
        const user = await interaction.client.users.fetch(participant.serverUser.userId);
        await user.send({
          embeds: [reminderEmbed],
          components: [reminderRow]
        });
        
        // Create response history entry for reminder sent
        const hoursBeforeEvent = calculateHoursBeforeEvent(eventData.date, eventData.time);
        await createResponseHistory(
          participant.id,
          'PENDING',
          'PENDING',
          0,
          undefined,
          'AFTER_REMINDER',
          hoursBeforeEvent
        );
        
        successCount++;
      } catch (error) {
        console.error(`Could not send reminder to ${participant.serverUser.username}:`, error);
        failCount++;
      }
    }
    
    // Update event reminders sent count
    await db.update(events)
      .set({ 
        remindersSent: sql`${events.remindersSent} + 1`
      })
      .where(eq(events.id, eventId));
    
    // Create audit log
    await createAuditLog(eventId, 'REMINDER_SENT', interaction.user.id, {
      successCount,
      failCount,
      totalPending: pendingParticipants.length
    });
    
    await interaction.followUp({ 
      content: `Erinnerungen gesendet!\n` +
        `✅ ${successCount} Erinnerungen erfolgreich versandt.\n` +
        (failCount > 0 ? `❌ ${failCount} Erinnerungen konnten nicht zugestellt werden.` : ''),
      ephemeral: true 
    });
  } catch (error) {
    console.error('Error sending reminders:', error);
    
    try {
      if (!interaction.replied) {
        await interaction.reply({ 
          content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.", 
          ephemeral: true 
        });
      } else {
        await interaction.followUp({ 
          content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.", 
          ephemeral: true 
        });
      }
    } catch (e) {
      console.error('Could not send error message:', e);
    }
  }
}

// Starterinnerung an zugesagte Teilnehmer senden
export async function sendStartReminder(interaction: ButtonInteraction, eventId: string): Promise<void> {
  try {
    await interaction.reply({ 
      content: "Sende Starterinnerungen an alle zugesagten Teilnehmer...", 
      ephemeral: true 
    });

    // Get event with eligible participants
    const eventData = await db.query.events.findFirst({
      where: eq(events.id, eventId),
      with: {
        participants: {
          where: inArray(participants.currentStatus, ['ACCEPTED', 'ACCEPTED_WITHOUT_TIME', 'ACCEPTED_WITH_RESERVATION', 'OTHER_TIME']),
          with: {
            serverUser: true
          }
        }
      }
    });
    
    if (!eventData) {
      await interaction.followUp({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
      return;
    }
    
    // Check if event is active
    if (eventData.status !== 'ACTIVE') {
      await interaction.followUp({ 
        content: `Diese Terminsuche wurde ${eventData.status === 'CLOSED' ? 'geschlossen' : 'abgebrochen'}.`, 
        ephemeral: true 
      });
      return;
    }
    
    const eligibleParticipants = eventData.participants;
    
    if (eligibleParticipants.length === 0) {
      await interaction.followUp({ 
        content: "Es gibt keine Teilnehmer, die bereits zugesagt haben oder eine alternative Uhrzeit angegeben haben.", 
        ephemeral: true 
      });
      return;
    }
    
    let successCount = 0;
    let failCount = 0;
    
    // Create start reminder embed
    const startReminderEmbed = new EmbedBuilder()
      .setColor('#FEE75C') 
      .setTitle(`🎮 Termin ${eventData.title} beginnt gleich!`)
      .setDescription(`Der Termin beginnt am ${eventData.date} um ${eventData.time} Uhr.${eventData.relativeDate ? `\nDas ist ${eventData.relativeDate}` : ''}\n\n⏰ Bitte bereite dich auf den Start vor!${eventData.comment ? `\n\n**Kommentar:** ${eventData.comment}` : ''}`)
      .setTimestamp()
      .setFooter({ text: `Event ID: ${eventId}` });

    // Send start reminders and track context for any status changes afterward
    for (const participant of eligibleParticipants) {
      try {
        const user = await interaction.client.users.fetch(participant.serverUser.userId);
        await user.send({ embeds: [startReminderEmbed] });
        
        // Create response history entry for start reminder sent
        const hoursBeforeEvent = calculateHoursBeforeEvent(eventData.date, eventData.time);
        await createResponseHistory(
          participant.id,
          participant.currentStatus,
          participant.currentStatus,
          0,
          participant.alternativeTime || undefined,
          'AFTER_START_REMINDER',
          hoursBeforeEvent
        );
        
        successCount++;
      } catch (error) {
        console.error(`Could not send start reminder to ${participant.serverUser.username}:`, error);
        failCount++;
      }
    }
    
    // Create audit log
    await createAuditLog(eventId, 'START_REMINDER_SENT', interaction.user.id, {
      successCount,
      failCount,
      totalEligible: eligibleParticipants.length
    });
    
    await interaction.followUp({ 
      content: `Starterinnerungen gesendet!\n` +
        `✅ ${successCount} Starterinnerungen erfolgreich versandt.\n` +
        (failCount > 0 ? `❌ ${failCount} Starterinnerungen konnten nicht zugestellt werden.` : ''),
      ephemeral: true 
    });
  } catch (error) {
    console.error('Error sending start reminders:', error);
    
    try {
      if (!interaction.replied) {
        await interaction.reply({ 
          content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.", 
          ephemeral: true 
        });
      } else {
        await interaction.followUp({ 
          content: "Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es später erneut.", 
          ephemeral: true 
        });
      }
    } catch (e) {
      console.error('Could not send error message:', e);
    }
  }
}

// Helper function to load events (for backward compatibility)
export function loadEvents() {
  // This function is kept for compatibility but should not be used
  // All data should now come from the database
  console.warn('loadEvents() called - this function is deprecated. Use database queries instead.');
  return [];
}

// Helper function to save events (for backward compatibility)
export function saveEvents(events: any[]) {
  // This function is kept for compatibility but should not be used
  // All data should now be saved to the database
  console.warn('saveEvents() called - this function is deprecated. Use database operations instead.');
}

// Export default object for compatibility
export default {
  createEvent,
  inviteParticipant,
  updateEventMessage,
  handleResponse,
  handleAlternativeTime,
  sendReminders,
  sendStartReminder,
  showCancelModal,
  handleCancelEvent,
  closeEvent,
  loadEvents,
  saveEvents
};