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
  channel: TextChannel
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
    .setDescription(`Termin für ${date} um ${time} Uhr.\nStatus der Teilnehmer:`)
    .setTimestamp()
    .setFooter({ text: `Event ID: ${eventId} • Status: Aktiv` });
  
  // Admin-Buttons (erste Reihe)
  const adminButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`manage:${eventId}:cancel`)
        .setLabel('Terminsuche abbrechen')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`manage:${eventId}:close`)
        .setLabel('Terminsuche schließen')
        .setStyle(ButtonStyle.Primary)
    );
  
  // Teilnehmer-Buttons (zweite Reihe)
  const responseButtons = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`respond:${eventId}:accept`)
        .setLabel('Zusagen')
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
  time: string
): Promise<void> {
  const events = loadEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    console.error(`Event mit ID ${eventId} nicht gefunden.`);
    return;
  }
  
  // Teilnehmer zur Liste hinzufügen
  events[eventIndex].participants.push({
    userId: user.id,
    username: user.username,
    status: 'pending',
    alternativeTime: '' // Neues Feld für alternative Uhrzeit
  });
  
  // Embed für DM erstellen
  const dmEmbed = new EmbedBuilder()
    .setColor('#0099ff')
    .setTitle(`Terminsuche: ${title}`)
    .setDescription(`Du wurdest eingeladen am ${date} an ${title} teilzunehmen, um ${time} Uhr.`)
    .setTimestamp()
    .setFooter({ text: `Event ID: ${eventId}` });
  
  // Buttons für DM
  const dmRow = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`respond:${eventId}:accept`)
        .setLabel('Zusagen')
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
  } catch (error) {
    console.error(`Konnte keine DM an ${user.username} senden:`, error);
    // Teilnehmer aus der Liste entfernen
    events[eventIndex].participants = events[eventIndex].participants.filter(p => p.userId !== user.id);
  }
  
  saveEvents(events);
  
  // Server-Channel-Nachricht aktualisieren
  await updateEventMessage(eventId);
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
    
    // Status-Text für jeden Teilnehmer
    let participantsText = "";
    for (const participant of event.participants) {
      let statusText: string;
      
      switch (participant.status) {
        case 'accepted':
          statusText = "✅ Zugesagt";
          break;
        case 'acceptedWithoutTime':
          statusText = "⏱️ Zugesagt ohne Uhrzeitgarantie";
          break;
        case 'declined':
          statusText = "❌ Abgesagt";
          break;
        case 'otherTime':
          statusText = `🕒 Andere Uhrzeit: ${participant.alternativeTime}`;
          break;
        default:
          statusText = "⏳ Warte auf Antwort";
      }
      
      participantsText += `<@${participant.userId}>: ${statusText}\n`;
    }
    
    if (participantsText === "") {
      participantsText = "Keine Teilnehmer eingeladen.";
    }
    
    // Status als Text
    const statusText = event.status === 'active' 
      ? 'Aktiv' 
      : event.status === 'closed' 
        ? 'Geschlossen' 
        : 'Abgebrochen';
    
    // Embed für Server-Channel aktualisieren
    const updatedEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Terminplanung: ${event.title}`)
      .setDescription(`Termin für ${event.date} um ${event.time} Uhr.\nStatus der Teilnehmer:`)
      .addFields({ name: 'Teilnehmer', value: participantsText })
      .setTimestamp()
      .setFooter({ text: `Event ID: ${event.id} • Status: ${statusText}` });
    
    // Admin-Buttons aktualisieren (erste Reihe)
    const updatedAdminButtons = new ActionRowBuilder<ButtonBuilder>();
    
    if (event.status === 'active') {
      updatedAdminButtons.addComponents(
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
    
    // Teilnehmer-Buttons aktualisieren (zweite Reihe)
    const updatedResponseButtons = new ActionRowBuilder<ButtonBuilder>();
    
    if (event.status === 'active') {
      updatedResponseButtons.addComponents(
        new ButtonBuilder()
          .setCustomId(`respond:${eventId}:accept`)
          .setLabel('Zusagen')
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
    
    await message.edit({
      embeds: [updatedEmbed],
      components: event.status === 'active' ? [updatedAdminButtons, updatedResponseButtons] : []
    });
  } catch (error) {
    console.error(`Fehler beim Aktualisieren der Event-Nachricht:`, error);
  }
}

// Modal für alternative Uhrzeit anzeigen
export async function showAlternativeTimeModal(interaction: ButtonInteraction, eventId: string): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId(`alternativeTime:${eventId}`)
    .setTitle('Alternative Uhrzeit angeben');
  
  const timeInput = new TextInputBuilder()
    .setCustomId('alternativeTimeInput')
    .setLabel('Zu welcher Uhrzeit könntest du teilnehmen?')
    .setPlaceholder('z.B. 18:00 oder 19:30-21:00')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);
  
  const firstActionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(timeInput);
  
  modal.addComponents(firstActionRow);
  
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
  
  const alternativeTime = interaction.fields.getTextInputValue('alternativeTimeInput');
  
  // Teilnehmerstatus aktualisieren
  event.participants[participantIndex].status = 'otherTime';
  event.participants[participantIndex].alternativeTime = alternativeTime;
  
  saveEvents(events);
  
  await updateEventMessage(eventId);
  await interaction.reply({ 
    content: `Danke für deine Antwort! Du hast für "${event.title}" am ${event.date} eine alternative Uhrzeit (${alternativeTime}) angegeben.`, 
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
    await interaction.reply({ 
      content: `Diese Terminsuche wurde ${event.status === 'closed' ? 'geschlossen' : 'abgebrochen'}.`, 
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

// Event abbrechen
export async function cancelEvent(interaction: ButtonInteraction, eventId: string): Promise<void> {
  const events = loadEvents();
  const eventIndex = events.findIndex(e => e.id === eventId);
  
  if (eventIndex === -1) {
    await interaction.reply({ content: "Dieses Event existiert nicht mehr.", ephemeral: true });
    return;
  }
  
  events[eventIndex].status = 'cancelled';
  saveEvents(events);
  
  // Server-Channel-Nachricht aktualisieren
  await updateEventMessage(eventId);
  await interaction.reply({ content: "Die Terminsuche wurde abgebrochen.", ephemeral: true });
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
  cancelEvent,
  closeEvent
};