// src/clientStore.ts
import { Client } from 'discord.js';

let _client: Client | null = null;

export function setClient(client: Client): void {
  _client = client;
}

export function getClient(): Client {
  if (!_client) throw new Error('Discord client not initialized');
  return _client;
}
