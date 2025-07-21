// src/index.ts
import { Client, GatewayIntentBits, Collection, Events, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Command } from './types';
import { PermissionFlagsBits } from 'discord.js';
import { 
  registerCommands, 
  registerCommandsForAllGuilds, 
  deleteAllCommands, 
  deleteCommandsForAllGuilds 
} from './deploy-commands';
import { initializeDatabase, testDatabaseConnection } from './db';

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

// Database initialization function
async function initializeBot(): Promise<void> {
  try {
    console.log('🤖 Starting Discord Terminplanungsbot...');
    
    // Test database connection first
    console.log('🔍 Testing database connection...');
    const dbConnectionSuccess = await testDatabaseConnection();
    if (!dbConnectionSuccess) {
      throw new Error('Database connection failed');
    }
    
    // Initialize database
    console.log('🗄️ Initializing database...');
    await initializeDatabase();
    console.log('✅ Database ready!');
    
    // Load commands
    console.log('📋 Loading commands...');
    await loadCommands();
    console.log('✅ Commands loaded!');
    
    // Login to Discord
    console.log('🔗 Connecting to Discord...');
    await client.login(process.env.BOT_TOKEN);
    
  } catch (error) {
    console.error('❌ Bot initialization failed:', error);
    process.exit(1);
  }
}

// Load commands function
async function loadCommands(): Promise<void> {
  const commandsPath = path.join(__dirname, 'commands');
  
  // Check if commands directory exists
  if (!fs.existsSync(commandsPath)) {
    console.warn('⚠️ Commands directory not found, creating...');
    fs.mkdirSync(commandsPath, { recursive: true });
    return;
  }
  
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`  ✓ Loaded command: ${command.data.name}`);
      } else {
        console.log(`  ⚠️ Command in ${filePath} missing required "data" or "execute" property`);
      }
    } catch (error) {
      console.error(`  ❌ Error loading command ${file}:`, error);
    }
  }
}

// Event Handler für Slash Commands
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error('❌ Error executing command:', error);
    
    const errorMessage = 'There was an error while executing this command!';
    
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    } catch (followUpError) {
      console.error('❌ Error sending error message:', followUpError);
    }
  }
});

// Button Interaktionen
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton()) {
    try {
      // Die EventID aus der customId extrahieren
      const [action, eventId, option] = interaction.customId.split(':');

      if (action === 'respond') {
        const terminManager = require('./terminManager');
        await terminManager.handleResponse(interaction, eventId, option);
      } else if (action === 'manage') {
        const terminManager = require('./terminManager');
        
        // Überprüfen, ob der Nutzer Admin ist
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
          await interaction.reply({ content: "Du hast keine Berechtigung, diesen Button zu nutzen.", ephemeral: true });
          return;
        }
        
        if (option === 'cancel') {
          await terminManager.showCancelModal(interaction, eventId);
        } else if (option === 'close') {
          await terminManager.closeEvent(interaction, eventId);
        } else if (option === 'remind') {
          await terminManager.sendReminders(interaction, eventId);
        } else if (option === 'startReminder') {
          await terminManager.sendStartReminder(interaction, eventId);
        }
      }
    } catch (error) {
      console.error('❌ Error handling button interaction:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Ein Fehler ist aufgetreten.', ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ Error sending button error message:', replyError);
      }
    }
  } else if (interaction.isModalSubmit()) {
    try {
      // Die EventID aus der customId extrahieren
      const [action, eventId] = interaction.customId.split(':');
      
      if (action === 'alternativeTime') {
        const terminManager = require('./terminManager');
        await terminManager.handleAlternativeTime(interaction, eventId);
      } else if (action === 'cancelEvent') {
        const terminManager = require('./terminManager');
        await terminManager.handleCancelEvent(interaction, eventId);
      }
    } catch (error) {
      console.error('❌ Error handling modal interaction:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Ein Fehler ist aufgetreten.', ephemeral: true });
        }
      } catch (replyError) {
        console.error('❌ Error sending modal error message:', replyError);
      }
    }
  }
});

// Event Handler für Beitritt zu neuen Servern
client.on(Events.GuildCreate, async guild => {
  try {
    console.log(`🎉 Bot joined new server: ${guild.name} (ID: ${guild.id})`);
    
    // Registriere Befehle für den neuen Server
    await registerCommands(guild.id);
    console.log(`✅ Commands registered for ${guild.name}`);
  } catch (error) {
    console.error(`❌ Error registering commands for new server ${guild.name}:`, error);
  }
});

// Event Handler für Bot verlässt Server
client.on(Events.GuildDelete, async guild => {
  console.log(`👋 Bot left server: ${guild.name} (ID: ${guild.id})`);
  // Note: Server data remains in database for potential rejoins
  // Could implement cleanup logic here if needed
});

// Client ready handler
client.once(Events.ClientReady, async () => {
  try {
    console.log(`🚀 Bot is ready! Logged in as ${client.user?.tag}`);
    console.log(`📊 Connected to ${client.guilds.cache.size} servers`);
    
    // Clean up existing commands first
    console.log('🧹 Cleaning up existing commands...');
    await deleteCommandsForAllGuilds(client);
    console.log('✅ Existing commands cleaned up');
    
    // Register new commands for all servers
    console.log('📝 Registering commands for all servers...');
    await registerCommandsForAllGuilds(client);
    console.log('✅ Commands registered for all existing servers');
    
    // Set bot activity status
    client.user?.setActivity('Termine planen | /help', { type: 0 });
    
    console.log('🎯 Bot fully operational!');
  } catch (error) {
    console.error('❌ Error in ready handler:', error);
  }
});

// Error handling
client.on(Events.Error, error => {
  console.error('❌ Discord client error:', error);
});

client.on(Events.Warn, info => {
  console.warn('⚠️ Discord client warning:', info);
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  try {
    await client.destroy();
    console.log('✅ Discord client destroyed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  try {
    await client.destroy();
    console.log('✅ Discord client destroyed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// Start the bot
initializeBot().catch(error => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});

export default { client };