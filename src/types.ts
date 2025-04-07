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
  status: 'pending' | 'accepted' | 'acceptedWithoutTime' | 'declined' | 'otherTime';
  alternativeTime?: string;  // Neue Eigenschaft für alternative Uhrzeit
}

export interface Event {
  id: string;
  title: string;
  date: string;
  time: string;
  organizer: string;
  participants: Participant[];
  channelId: string;
  messageId: string;
  status: 'active' | 'closed' | 'cancelled';
}