import { ButtonInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, User, TextChannel, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { Event, Participant } from './types';


const dataFolder = path.join(__dirname, '..', 'data');
const eventsFile = path.join(dataFolder, 'events.json');

// Sicherstellen, dass der Datenordner existiert
if (!fs.existsSync(dataFolder)) {
  fs.mkdirSync(dataFolder, { recursive: true });
}

// Sicherstellen, dass die Events-Datei existiert
if (!fs.existsSync(eventsFile)) {
  fs.writeFileSync(eventsFile, JSON.stringify([], null, 2));
}

// Events aus Datei laden
function loadEvents(): Event[] {
  try {
    const data = fs.readFileSync(eventsFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Fehler beim Laden der Events:', error);
    return [];
  }
}

// Events in Datei speichern
function saveEvents(events: Event[]): void {
  try {
    fs.writeFileSync(eventsFile, JSON.stringify(events, null, 2));
  } catch (error) {
    console.error('Fehler beim Speichern der Events:', error);
  }
}

// Neues Event erstellen
export async function createEvent(
  title: string,
  date: string,
  time: string,
  organizerId: string,
  participants: string[],
  channel: TextChannel,
  relativeDate?: string | null,
  comment?: string | null
): Promise<string> {
  const events = loadEvents();
  
  // Neue Event-ID generieren
  const eventId = Date.now().toString();
  
  // Teilnehmer initialisieren
  const participantsList: Participant[] = [];
  
  // Embed für den Server-Channel erstellen
  const serverEmbed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Terminplanung: ${title}`)
    .setDescription(`Termin für ${date} um ${time} Uhr.${relativeDate ? `\nDas ist ${relativeDate}` : ''}${comment ? `\n\n**Kommentar:** ${comment}` : ''}\n`)
    .setTimestamp()
    .setFooter({ text: `Event ID: ${eventId} • Status: Aktiv` });
  
  // Admin-Buttons (erste Reihe)
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
  
  // Teilnehmer-Buttons (zweite Reihe - alle 5 Buttons)
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

  // Nachricht im Server-Channel senden
  const message = await channel.send({
    embeds: [serverEmbed],
    components: [adminButtons, responseButtons]
  });
  
  // Event in der Liste speichern
  const newEvent: Event = {
    id: eventId,
    title,
    date,
    time,
    relativeDate: relativeDate || undefined,
    comment: comment || undefined,
    organizer: organizerId,
    participants: participantsList,
    channelId: channel.id,
    messageId: message.id,
    status: 'active'
  };
  
  events.push(newEvent);
  saveEvents(events);
  
  return eventId;
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
  const events = loadEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    console.error(`Event mit ID ${eventId} nicht gefunden.`);
    return false;
  }
  
  // Teilnehmer zur Liste hinzufügen
  events[eventIndex].participants.push({
    userId: user.id,
    username: user.username,
    status: 'pending',
    alternativeTime: ''
  });
  
  // Beschreibung mit optionalem relativem Datum und Kommentar
  let description = `Du wurdest eingeladen am ${date} an ${title} teilzunehmen, um ${time} Uhr.`;
  
  if (relativeDate) {
    description += `\nDas ist ${relativeDate}`;
  }
  
  if (comment) {
    description += `\n\n**Kommentar:** ${comment}`;
  }
  
  // Embed für DM erstellen
  const dmEmbed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Terminsuche: ${title}`)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: `Event ID: ${eventId}` });
  
  // Buttons für DM (eine Reihe mit allen 5 Buttons)
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
    // DM an Teilnehmer senden
    if (events[eventIndex].status === 'active') {
      await user.send({
        embeds: [dmEmbed],
        components: [dmRow]
      });
    } else {
      // Bei geschlossenem oder abgebrochenem Event keine Buttons anzeigen
      await user.send({
        embeds: [dmEmbed],
        components: []
      });
    }
    
    saveEvents(events);
    
    // Server-Channel-Nachricht aktualisieren
    await updateEventMessage(eventId);
    
    return true;
  } catch (error) {
    console.error(`Konnte keine DM an ${user.username} senden:`, error);
    // Teilnehmer aus der Liste entfernen
    events[eventIndex].participants = events[eventIndex].participants.filter(p => p.userId !== user.id);
    saveEvents(events);
    return false;
  }
}

// Event-Nachricht im Server aktualisieren
export async function updateEventMessage(eventId: string): Promise<void> {
  const events = loadEvents();
  const event = events.find(e => e.id === eventId);
  
  if (!event) {
    console.error(`Event mit ID ${eventId} nicht gefunden.`);
    return;
  }
  
  const client = (await import('./index')).default.client;
  const channel = await client.channels.fetch(event.channelId) as TextChannel;
  
  if (!channel) {
    console.error(`Channel für Event ${eventId} nicht gefunden.`);
    return;
  }
  
  try {
    const message = await channel.messages.fetch(event.messageId);
    
    // Status-Zähler für jeden Teilnehmerstatus
    let acceptedCount = 0;
    let declinedCount = 0;
    let acceptedWithoutTimeCount = 0;
    let acceptedWithReservationCount = 0;
    let pendingCount = 0;
    let otherTimeCount = 0;
    
    // Status-Text für jeden Teilnehmer
    let participantsText = "";
    for (const participant of event.participants) {
      let statusText: string;
      
      switch (participant.status) {
        case 'accepted':
          statusText = "✅ Zugesagt";
          acceptedCount++;
          break;
        case 'acceptedWithReservation':
          statusText = "☑️ Zugesagt mit Vorbehalt";
          acceptedWithReservationCount++;
          break;
        case 'acceptedWithoutTime':
          statusText = "⏱️ Zugesagt ohne Uhrzeitgarantie";
          acceptedWithoutTimeCount++;
          break;
        case 'declined':
          statusText = "❌ Abgesagt";
          declinedCount++;
          break;
        case 'otherTime':
          statusText = `🕒 Andere Uhrzeit: ${participant.alternativeTime}`;
          otherTimeCount++;
          break;
        default:
          statusText = "⏳ Warte auf Antwort";
          pendingCount++;
      }
      
      participantsText += `<@${participant.userId}>: ${statusText}\n`;
    }
    
    // Teilnehmeranzahl für die Überschrift
    const totalParticipants = event.participants.length;
    
    // Zusammenfassung der Status-Zahlen
    const statusSummary = `| ✅ ${acceptedCount} | ☑️ ${acceptedWithReservationCount} | ⏱️ ${acceptedWithoutTimeCount} | 🕒 ${otherTimeCount} | ❌ ${declinedCount} | ⏳ ${pendingCount} |`;
    
    if (participantsText === "") {
      participantsText = "Keine Teilnehmer eingeladen.";
    } else {
      // Füge Statusübersicht mit Abstand hinzu
      participantsText += `\n${statusSummary}`;
    }
    
    // Status als Text mit Abbruchgrund
    let statusText = event.status === 'active' 
      ? 'Aktiv' 
      : event.status === 'closed' 
        ? 'Geschlossen' 
        : 'Abgebrochen';
    
    // Abbruchgrund hinzufügen, falls vorhanden
    if (event.status === 'cancelled' && event.cancellationReason) {
      statusText += ` (${event.cancellationReason})`;
    }
    
    // Beschreibung mit optionalem relativem Datum und Kommentar
    let description = `Termin für ${event.date} um ${event.time} Uhr.`;
    
    if (event.relativeDate) {
      description += `\nDas ist ${event.relativeDate}`;
    }
    
    if (event.comment) {
      description += `\n\n**Kommentar:** ${event.comment}`;
    }
    
    description += `\n\nStatus der Teilnehmer:`;
    
    // Farbe basierend auf Event-Status bestimmen
    let embedColor = '#0099ff'; // Standard blau für aktive Events
    switch (event.status) {
      case 'active':
        embedColor = '#0099ff'; // Blau
        break;
      case 'closed':
        embedColor = '#00ff00'; // Grün
        break;
      case 'cancelled':
        embedColor = '#ff0000'; // Rot
        break;
    }
    
    // Embed für Server-Channel aktualisieren
    const updatedEmbed = new EmbedBuilder()
      .setColor(embedColor as any)
      .setTitle(`Terminplanung: ${event.title}`)
      .setDescription(description)
      .addFields({ name: `Teilnehmer (${totalParticipants})`, value: participantsText })
      .setTimestamp()
      .setFooter({ text: `Event ID: ${event.id} • Status: ${statusText}` });
    
    // Admin-Buttons aktualisieren (erste Reihe)
    const updatedAdminButtons = new ActionRowBuilder<ButtonBuilder>();
    
    if (event.status === 'active') {
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
    
    // Teilnehmer-Buttons aktualisieren (zweite Reihe - alle 5 Buttons)
    const updatedResponseButtons = new ActionRowBuilder<ButtonBuilder>();
    
    if (event.status === 'active') {
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
    
    const components = event.status === 'active' 
      ? [updatedAdminButtons, updatedResponseButtons] 
      : [];
    
    await message.edit({
      embeds: [updatedEmbed],
      components: components
    });
  } catch (error) {
    console.error(`Fehler beim Aktualisieren der Event-Nachricht:`, error);
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
    
    const events = loadEvents();
    const eventIndex = events.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      await interaction.editReply({ content: "Dieses Event existiert nicht mehr." });
      return;
    }
    
    const event = events[eventIndex];
    
    // Abbruchgrund und Benachrichtigungsoption aus den Eingabefeldern holen
    const reasonInput = interaction.fields.getTextInputValue('reasonInput').trim();
    const notifyInput = interaction.fields.getTextInputValue('notifyInput').trim();
    
    // Validierung der Benachrichtigungsoption
    if (notifyInput !== '0' && notifyInput !== '1') {
      await interaction.editReply({ 
        content: "Bitte gib nur '0' (keine Benachrichtigung) oder '1' (Benachrichtigung senden) ein." 
      });
      return;
    }
    
    const shouldNotify = notifyInput === '1';
    
    // Event als abgebrochen markieren
    events[eventIndex].status = 'cancelled';
    
    // Abbruchgrund speichern, falls angegeben
    if (reasonInput) {
      events[eventIndex].cancellationReason = reasonInput;
    }
    
    saveEvents(events);
    
    // Benachrichtigungen senden, falls gewünscht
    let notificationCount = 0;
    let notificationErrors = 0;
    
    if (shouldNotify) {
      // Teilnehmer mit Zusagen finden
      const participantsToNotify = event.participants.filter(p => 
        p.status === 'accepted' || 
        p.status === 'acceptedWithoutTime' || 
        p.status === 'acceptedWithReservation' ||
        p.status === 'otherTime'
      );
      
      if (participantsToNotify.length > 0) {
        // Abbruch-Nachricht erstellen
        let cancellationMessage = `Der Termin "${event.title}" am ${event.date} um ${event.time} Uhr wurde abgebrochen.`;
        
        if (reasonInput) {
          cancellationMessage += `\n\n**Grund:** ${reasonInput}`;
        }
        
        const cancellationEmbed = new EmbedBuilder()
          .setColor('#FF0000') // Rot für Abbruch
          .setTitle(`❌ Termin abgebrochen: ${event.title}`)
          .setDescription(cancellationMessage)
          .setTimestamp()
          .setFooter({ text: `Event ID: ${eventId}` });
        
        // Benachrichtigungen senden
        for (const participant of participantsToNotify) {
          try {
            const user = await interaction.client.users.fetch(participant.userId);
            await user.send({ embeds: [cancellationEmbed] });
            notificationCount++;
          } catch (error) {
            console.error(`Konnte keine Abbruchbenachrichtigung an ${participant.username} senden:`, error);
            notificationErrors++;
          }
        }
      }
    }
    
    // Server-Channel-Nachricht aktualisieren
    await updateEventMessage(eventId);
    
    // Rückmeldung an den Admin
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
    console.error('Fehler beim Abbrechen des Events:', error);
    
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
}

// Erinnerung an nicht antwortende Teilnehmer senden
export async function sendReminders(interaction: ButtonInteraction, eventId: string): Promise<void> {
  try {
    // Sofort auf die Interaktion antworten, um den Timeout zu vermeiden
    await interaction.reply({ 
      content: "Sende Erinnerungen an Teilnehmer ohne Antwort...", 
      ephemeral: true 
    });

    const events = loadEvents();
    const eventIndex = events.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      await interaction.followUp({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
      return;
    }
    
    const event = events[eventIndex];
    
    // Prüfen, ob das Event noch aktiv ist
    if (event.status !== 'active') {
      await interaction.followUp({ 
        content: `Diese Terminsuche wurde ${event.status === 'closed' ? 'geschlossen' : 'abgebrochen'}.`, 
        ephemeral: true 
      });
      return;
    }
    
    // Teilnehmer ohne Antwort finden
    const pendingParticipants = event.participants.filter(p => p.status === 'pending');
    
    if (pendingParticipants.length === 0) {
      await interaction.followUp({ 
        content: "Es gibt keine Teilnehmer, die noch nicht geantwortet haben.", 
        ephemeral: true 
      });
      return;
    }
    
    // Erinnerung an jeden Teilnehmer ohne Antwort senden
    let successCount = 0;
    let failCount = 0;
    
    // Beschreibung mit optionalem relativem Datum und Kommentar für Erinnerung
    let reminderDescription = `Erinnerung: Du wurdest eingeladen am ${event.date} an ${event.title} teilzunehmen, um ${event.time} Uhr.`;
    
    if (event.relativeDate) {
      reminderDescription += `\nDas ist ${event.relativeDate}`;
    }
    
    if (event.comment) {
      reminderDescription += `\n\n**Kommentar:** ${event.comment}`;
    }
    
    reminderDescription += `\n\n**Bitte antworte auf die Einladung.**`;
    
    // Embed für Erinnerung erstellen
    const reminderEmbed = new EmbedBuilder()
      .setColor('#FFA500') // Orange für Erinnerung
      .setTitle(`Erinnerung: Terminsuche ${event.title}`)
      .setDescription(reminderDescription)
      .setTimestamp()
      .setFooter({ text: `Event ID: ${eventId}` });
    
    // Buttons für Erinnerung (eine Reihe mit allen 5 Buttons)
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
    
    // Sende Erinnerungen
    for (const participant of pendingParticipants) {
      try {
        const user = await interaction.client.users.fetch(participant.userId);
        await user.send({
          embeds: [reminderEmbed],
          components: [reminderRow]
        });
        successCount++;
      } catch (error) {
        console.error(`Konnte keine Erinnerung an ${participant.username} senden:`, error);
        failCount++;
      }
    }
    
    // Rückmeldung an den Admin als follow-up
    await interaction.followUp({ 
      content: `Erinnerungen gesendet!\n` +
        `✅ ${successCount} Erinnerungen erfolgreich versandt.\n` +
        (failCount > 0 ? `❌ ${failCount} Erinnerungen konnten nicht zugestellt werden.` : ''),
      ephemeral: true 
    });
  } catch (mainError) {
    console.error('KRITISCHER FEHLER BEI ERINNERUNG:', mainError);
    
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
      console.error('Konnte auch keine Fehlermeldung senden:', e);
    }
  }
}

// Starterinnerung an zugesagte Teilnehmer senden
export async function sendStartReminder(interaction: ButtonInteraction, eventId: string): Promise<void> {
  try {
    // Sofort auf die Interaktion antworten, um den Timeout zu vermeiden
    await interaction.reply({ 
      content: "Sende Starterinnerungen an alle zugesagten Teilnehmer...", 
      ephemeral: true 
    });

    const events = loadEvents();
    const eventIndex = events.findIndex(e => e.id === eventId);
    
    if (eventIndex === -1) {
      await interaction.followUp({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
      return;
    }
    
    const event = events[eventIndex];
    
    // Prüfen, ob das Event noch aktiv ist
    if (event.status !== 'active') {
      await interaction.followUp({ 
        content: `Diese Terminsuche wurde ${event.status === 'closed' ? 'geschlossen' : 'abgebrochen'}.`, 
        ephemeral: true 
      });
      return;
    }
    
    // Teilnehmer finden, die zugesagt haben oder eine andere Uhrzeit angegeben haben
    const eligibleParticipants = event.participants.filter(p => 
      p.status === 'accepted' || 
      p.status === 'acceptedWithoutTime' || 
      p.status === 'acceptedWithReservation' ||
      p.status === 'otherTime'
    );
    
    if (eligibleParticipants.length === 0) {
      await interaction.followUp({ 
        content: "Es gibt keine Teilnehmer, die bereits zugesagt haben oder eine alternative Uhrzeit angegeben haben.", 
        ephemeral: true 
      });
      return;
    }
    
    // Starterinnerung an jeden zugesagten Teilnehmer senden
    let successCount = 0;
    let failCount = 0;
    let errorDetails = "";
    
    // Embed für Starterinnerung erstellen
    const startReminderEmbed = new EmbedBuilder()
      .setColor('#FEE75C') 
      .setTitle(`🎮 Termin ${event.title} beginnt gleich!`)
      .setDescription(`Der Termin beginnt am ${event.date} um ${event.time} Uhr.${event.relativeDate ? `\nDas ist ${event.relativeDate}` : ''}\n\n⏰ Bitte bereite dich auf den Start vor!${event.comment ? `\n\n**Kommentar:** ${event.comment}` : ''}`)
      .setTimestamp()
      .setFooter({ text: `Event ID: ${eventId}` });

    // Sende Starterinnerungen
    for (const participant of eligibleParticipants) {
      try {
        const user = await interaction.client.users.fetch(participant.userId);
        if (!user) {
          console.error(`Benutzer mit ID ${participant.userId} konnte nicht gefunden werden.`);
          failCount++;
          errorDetails += `- Benutzer ${participant.username} (${participant.userId}) konnte nicht gefunden werden.\n`;
          continue;
        }
        
        await user.send({ embeds: [startReminderEmbed] });
        successCount++;
      } catch (error) {
        console.error(`Konnte keine Starterinnerung an ${participant.username} senden:`, error);
        failCount++;
        errorDetails += `- Fehler beim Senden an ${participant.username}: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}\n`;
      }
    }
    
    // Abschließende Information als Follow-up senden
    let responseContent = `Starterinnerungen gesendet!\n` +
      `✅ ${successCount} Starterinnerungen erfolgreich versandt.\n` +
      (failCount > 0 ? `❌ ${failCount} Starterinnerungen konnten nicht zugestellt werden.` : '');
    
    if (failCount > 0 && errorDetails.length < 1800) {
      responseContent += `\n\nFehlerdetails:\n${errorDetails}`;
    }
    
    await interaction.followUp({ content: responseContent, ephemeral: true });
  } catch (mainError) {
    console.error('KRITISCHER FEHLER BEI STARTERINNERUNG:', mainError);
    
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
      console.error('Konnte auch keine Fehlermeldung senden:', e);
    }
  }
}

// Modal für alternative Uhrzeit anzeigen
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

// Alternative Uhrzeit-Antwort verarbeiten
export async function handleAlternativeTime(
  interaction: ModalSubmitInteraction, 
  eventId: string
): Promise<void> {
  const events = loadEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    await interaction.reply({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
    return;
  }
  
  const event = events[eventIndex];
  
  // Prüfen, ob das Event noch aktiv ist
  if (event.status !== 'active') {
    await interaction.reply({ 
      content: `Diese Terminsuche wurde ${event.status === 'closed' ? 'geschlossen' : 'abgebrochen'}.`, 
      ephemeral: true 
    });
    return;
  }
  
  // Teilnehmer finden
  const participantIndex = event.participants.findIndex(p => p.userId === interaction.user.id);
  
  if (participantIndex === -1) {
    await interaction.reply({ content: "Du bist kein Teilnehmer dieses Events.", ephemeral: true });
    return;
  }
  
  // Stunde und Minute aus den Eingabefeldern holen
  const hourInput = interaction.fields.getTextInputValue('hourInput');
  const minuteInput = interaction.fields.getTextInputValue('minuteInput');
  
  // Validierung: Nur Zahlen erlaubt
  if (!/^\d+$/.test(hourInput) || !/^\d+$/.test(minuteInput)) {
    await interaction.reply({ 
      content: "Bitte gib nur Zahlen für Stunde und Minute ein.", 
      ephemeral: true 
    });
    return;
  }
  
  // In Zahlen umwandeln
  const hour = parseInt(hourInput);
  const minute = parseInt(minuteInput);
  
  // Validierung der Werte
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
  
  // Formatierung: Führende Nullen hinzufügen wenn nötig
  const formattedHour = hour.toString().padStart(2, '0');
  const formattedMinute = minute.toString().padStart(2, '0');
  
  // Finale Zeit mit "ca." und "Uhr" formatieren
  const formattedTime = `ca. ${formattedHour}:${formattedMinute} Uhr`;
  
  // Teilnehmerstatus aktualisieren
  event.participants[participantIndex].status = 'otherTime';
  event.participants[participantIndex].alternativeTime = formattedTime;
  
  saveEvents(events);
  
  await updateEventMessage(eventId);
  await interaction.reply({ 
    content: `Danke für deine Antwort! Du hast für "${event.title}" am ${event.date} eine alternative Uhrzeit (${formattedTime}) angegeben.`, 
    ephemeral: true 
  });
}

// Antworten der Teilnehmer verarbeiten
export async function handleResponse(interaction: ButtonInteraction, eventId: string, response: string): Promise<void> {
  const events = loadEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    await interaction.reply({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
    return;
  }
  
  const event = events[eventIndex];
  
  // Prüfen, ob das Event noch aktiv ist
  if (event.status !== 'active') {
    let statusMessage = `Diese Terminsuche wurde ${event.status === 'closed' ? 'geschlossen' : 'abgebrochen'}.`;
    
    // Abbruchgrund hinzufügen, falls vorhanden
    if (event.status === 'cancelled' && event.cancellationReason) {
      statusMessage += `\n\n**Grund:** ${event.cancellationReason}`;
    }
    
    await interaction.reply({ 
      content: statusMessage, 
      ephemeral: true 
    });
    return;
  }
  
  // Teilnehmer finden
  const participantIndex = event.participants.findIndex(p => p.userId === interaction.user.id);
  
  if (participantIndex === -1) {
    await interaction.reply({ content: "Du bist nicht zu diesem Termin eingeladen. Nur eingeladene Teilnehmer können antworten.", ephemeral: true });
    return;
  }
  
  // Bei "Andere Uhrzeit" das Modal anzeigen
  if (response === 'otherTime') {
    await showAlternativeTimeModal(interaction, eventId);
    return;
  }
  
  let responseMessage = "";
  
  switch (response) {
    case 'accept':
      event.participants[participantIndex].status = 'accepted';
      responseMessage = `Danke für deine Zusage für "${event.title}" am ${event.date} um ${event.time} Uhr!`;
      break;
    case 'acceptWithReservation':
      event.participants[participantIndex].status = 'acceptedWithReservation';
      responseMessage = `Danke für deine Zusage mit Vorbehalt für "${event.title}" am ${event.date} um ${event.time} Uhr!`;
      break;
    case 'acceptNoTime':
      event.participants[participantIndex].status = 'acceptedWithoutTime';
      responseMessage = `Danke für deine Zusage für "${event.title}" am ${event.date}! Du hast angegeben, dass du ohne Uhrzeitgarantie teilnimmst.`;
      break;
    case 'decline':
      event.participants[participantIndex].status = 'declined';
      responseMessage = `Du hast für "${event.title}" am ${event.date} abgesagt.`;
      break;
  }
  
  saveEvents(events);
  
  await updateEventMessage(eventId);
  await interaction.reply({ content: responseMessage, ephemeral: true });
}

// Event schließen
export async function closeEvent(interaction: ButtonInteraction, eventId: string): Promise<void> {
  const events = loadEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    await interaction.reply({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
    return;
  }
  
  events[eventIndex].status = 'closed';
  saveEvents(events);
  
  // Server-Channel-Nachricht aktualisieren
  await updateEventMessage(eventId);
  await interaction.reply({ content: "Die Terminsuche wurde geschlossen.", ephemeral: true });
}

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

export { loadEvents, saveEvents };