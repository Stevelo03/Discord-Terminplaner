import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

export async function registerCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      console.log(`[WARNUNG] Der Befehl in ${filePath} fehlt eine benötigte "data" oder "execute" Eigenschaft.`);
    }
  }

  const rest = new REST().setToken(process.env.BOT_TOKEN || '');

  try {
    console.log(`Starte das Aktualisieren von ${commands.length} Slash-Befehlen.`);

    // Multi-Server-Unterstützung
    const guildIds = (process.env.GUILD_IDS || '').split(',').filter(id => id.trim());
    
    if (guildIds.length === 0) {
      console.error('Keine Server-IDs konfiguriert. Bitte setze GUILD_IDS in der .env-Datei.');
      return;
    }

    // Für jeden Server die Befehle registrieren
    for (const guildId of guildIds) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID || '',
          guildId.trim()
        ),
        { body: commands },
      );
      console.log(`Slash-Befehle für Server ${guildId.trim()} erfolgreich aktualisiert!`);
    }
  } catch (error) {
    console.error('Fehler beim Registrieren der Slash-Befehle:', error);
  }
}