import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

export async function registerCommands(guildId?: string) {
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
    console.log(`Starte das Aktualisieren von ${commands.length} Slash-Befehlen${guildId ? ` für Server ${guildId}` : ' für alle Server'}.`);

    // Wenn eine spezifische Guild-ID übergeben wurde, nur für diese registrieren
    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(
          process.env.CLIENT_ID || '',
          guildId
        ),
        { body: commands },
      );
      console.log(`Slash-Befehle für Server ${guildId} erfolgreich aktualisiert!`);
    } else {
      // Globale Befehle registrieren
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID || ''),
        { body: commands },
      );
      console.log('Globale Slash-Befehle erfolgreich aktualisiert!');
    }
  } catch (error) {
    console.error('Fehler beim Registrieren der Slash-Befehle:', error);
  }
}

// Funktion zum Registrieren für alle Guilds, in denen der Bot ist
export async function registerCommandsForAllGuilds(client: any) {
  const guildIds = client.guilds.cache.map((guild: any) => guild.id);
  
  for (const guildId of guildIds) {
    await registerCommands(guildId);
  }
}