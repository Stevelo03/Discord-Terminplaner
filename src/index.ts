import { Client, GatewayIntentBits, Collection, Events, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Command } from './types';
import { PermissionFlagsBits } from 'discord.js';
import { registerCommands } from './deploy-commands';

config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// Collection für Befehle
client.commands = new Collection();

// Befehle laden
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[WARNUNG] Der Befehl in ${filePath} fehlt eine benötigte "data" oder "execute" Eigenschaft.`);
  }
}

// Event Handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`Kein Befehl mit dem Namen ${interaction.commandName} gefunden.`);
    return;
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Bei der Ausführung dieses Befehls ist ein Fehler aufgetreten.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Bei der Ausführung dieses Befehls ist ein Fehler aufgetreten.', ephemeral: true });
    }
  }
});

// Button Interaktionen
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    // Die EventID aus der customId extrahieren
    const [action, eventId, option] = interaction.customId.split(':');

    if (action === 'respond') {
      const terminManager = require('./terminManager');
      terminManager.handleResponse(interaction, eventId, option);
    } else if (action === 'manage') {
      const terminManager = require('./terminManager');
      
      // Überprüfen, ob der Nutzer Admin ist
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        await interaction.reply({ content: "Du hast keine Berechtigung, diesen Button zu nutzen.", ephemeral: true });
        return;
      }
      
      if (option === 'cancel') {
        terminManager.cancelEvent(interaction, eventId);
      } else if (option === 'close') {
        terminManager.closeEvent(interaction, eventId);
      }
    }
  } else if (interaction.isModalSubmit()) {
    // Die EventID aus der customId extrahieren
    const [action, eventId] = interaction.customId.split(':');
    
    if (action === 'alternativeTime') {
      const terminManager = require('./terminManager');
      terminManager.handleAlternativeTime(interaction, eventId);
    }
  }
});

// Client einloggen
client.once(Events.ClientReady, async () => {
  console.log(`Eingeloggt als ${client.user?.tag}!`);
  await registerCommands();
});

client.login(process.env.BOT_TOKEN);
export default { client };