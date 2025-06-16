import { Collection, CommandInteraction, SlashCommandBuilder, Client } from 'discord.js';

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: CommandInteraction, client: Client) => Promise<void>;
}

declare module 'discord.js' {
  export interface Client {
    commands: Collection<string, Command>;
  }
}

export interface Participant {
  userId: string;
  username: string;
  status: 'pending' | 'accepted' | 'acceptedWithoutTime' | 'acceptedWithReservation' | 'declined' | 'otherTime';
  alternativeTime?: string;  // Eigenschaft für alternative Uhrzeit
}

export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  relativeDate?: string;  // Neues optionales Feld für relatives Datum
  comment?: string;       // Neues optionales Feld für Kommentar
  organizer: string;
  participants: Participant[];
  channelId: string;
  messageId: string;
  status: 'active' | 'closed' | 'cancelled';
  cancellationReason?: string;  // Neues Feld für Abbruchgrund
}