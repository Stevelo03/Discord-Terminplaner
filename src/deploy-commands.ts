// src/deploy-commands.ts
import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';

config();

export async function registerCommands(guildId?: string) {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  
  // Check if commands directory exists
  if (!fs.existsSync(commandsPath)) {
    console.error(`❌ Commands directory not found: ${commandsPath}`);
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => 
    file.endsWith('.js') || file.endsWith('.ts')
  );

  console.log(`🔍 Found ${commandFiles.length} command files`);

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    
    try {
      // Delete from require cache to allow hot reloading in development
      delete require.cache[require.resolve(filePath)];
      
      const command = require(filePath);
      
      if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded command: ${command.data.name}`);
      } else {
        console.log(`⚠️ Command in ${file} is missing required "data" or "execute" property`);
      }
    } catch (error) {
      console.error(`❌ Error loading command ${file}:`, error);
    }
  }

  if (commands.length === 0) {
    console.log('⚠️ No valid commands found to register');
    return;
  }

  // Validate environment variables
  if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN environment variable is required');
  }
  
  if (!process.env.CLIENT_ID) {
    throw new Error('CLIENT_ID environment variable is required');
  }

  const rest = new REST().setToken(process.env.BOT_TOKEN);

  try {
    console.log(`🚀 Started refreshing ${commands.length} application (/) commands${guildId ? ` for guild ${guildId}` : ' globally'}.`);

    let data: any;
    
    if (guildId) {
      // Register commands for specific guild (faster, for development)
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: commands },
      );
      console.log(`✅ Successfully reloaded ${Array.isArray(data) ? data.length : 0} guild commands for ${guildId}`);
    } else {
      // Register commands globally (slower, for production)
      data = await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log(`✅ Successfully reloaded ${Array.isArray(data) ? data.length : 0} global application commands`);
      console.log('⏳ Note: Global commands may take up to 1 hour to appear in all guilds');
    }

    return data;
  } catch (error) {
    console.error('❌ Error while registering commands:', error);
    throw error;
  }
}

// Register commands for all guilds the bot is in
export async function registerCommandsForAllGuilds(client: any) {
  if (!client || !client.guilds) {
    console.error('❌ Invalid client provided to registerCommandsForAllGuilds');
    return;
  }

  const guildIds = client.guilds.cache.map((guild: any) => guild.id);
  console.log(`🌐 Registering commands for ${guildIds.length} guilds`);
  
  let successCount = 0;
  let failCount = 0;

  for (const guildId of guildIds) {
    try {
      await registerCommands(guildId);
      successCount++;
      console.log(`✅ Commands registered for guild: ${guildId}`);
    } catch (error) {
      failCount++;
      console.error(`❌ Failed to register commands for guild ${guildId}:`, error);
    }
  }

  console.log(`📊 Command registration complete: ${successCount} success, ${failCount} failed`);
}

// Delete all commands
export async function deleteAllCommands(guildId?: string) {
  if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
    throw new Error('BOT_TOKEN and CLIENT_ID environment variables are required');
  }

  const rest = new REST().setToken(process.env.BOT_TOKEN);

  try {
    console.log(`🗑️ Started deleting application (/) commands${guildId ? ` for guild ${guildId}` : ' globally'}.`);

    if (guildId) {
      // Delete guild commands
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
        { body: [] },
      );
      console.log(`✅ Successfully deleted all guild commands for ${guildId}`);
    } else {
      // Delete global commands
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: [] },
      );
      console.log('✅ Successfully deleted all global application commands');
    }
  } catch (error) {
    console.error('❌ Error while deleting commands:', error);
    throw error;
  }
}

// Delete commands for all guilds
export async function deleteCommandsForAllGuilds(client: any) {
  if (!client || !client.guilds) {
    console.error('❌ Invalid client provided to deleteCommandsForAllGuilds');
    return;
  }

  const guildIds = client.guilds.cache.map((guild: any) => guild.id);
  console.log(`🗑️ Deleting commands for ${guildIds.length} guilds`);

  let successCount = 0;
  let failCount = 0;

  for (const guildId of guildIds) {
    try {
      await deleteAllCommands(guildId);
      successCount++;
    } catch (error) {
      failCount++;
      console.error(`❌ Failed to delete commands for guild ${guildId}:`, error);
    }
  }

  // Also delete global commands
  try {
    await deleteAllCommands();
    console.log('✅ Global commands deleted');
  } catch (error) {
    console.error('❌ Failed to delete global commands:', error);
  }

  console.log(`📊 Command deletion complete: ${successCount} guilds success, ${failCount} failed`);
}

// Get list of registered commands
export async function listCommands(guildId?: string) {
  if (!process.env.BOT_TOKEN || !process.env.CLIENT_ID) {
    throw new Error('BOT_TOKEN and CLIENT_ID environment variables are required');
  }

  const rest = new REST().setToken(process.env.BOT_TOKEN);

  try {
    let data: any;
    
    if (guildId) {
      data = await rest.get(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId)
      );
      console.log(`📋 Guild ${guildId} has ${Array.isArray(data) ? data.length : 0} commands:`);
    } else {
      data = await rest.get(
        Routes.applicationCommands(process.env.CLIENT_ID)
      );
      console.log(`📋 Global commands: ${Array.isArray(data) ? data.length : 0}`);
    }

    if (Array.isArray(data) && data.length > 0) {
      data.forEach((cmd: any, index: number) => {
        console.log(`  ${index + 1}. ${cmd.name} - ${cmd.description}`);
      });
    } else {
      console.log('  No commands found');
    }

    return data;
  } catch (error) {
    console.error('❌ Error while listing commands:', error);
    throw error;
  }
}

// Development helper: Quick register for current directory
export async function quickRegisterDev() {
  try {
    const devGuildId = process.env.DEV_GUILD_ID;
    
    if (devGuildId) {
      console.log('🔧 Development mode: Registering commands for dev guild only');
      await registerCommands(devGuildId);
    } else {
      console.log('🔧 Development mode: No DEV_GUILD_ID found, registering globally');
      await registerCommands();
    }
  } catch (error) {
    console.error('❌ Quick register failed:', error);
    throw error;
  }
}

// Utility to refresh commands (delete + register)
export async function refreshCommands(guildId?: string) {
  try {
    console.log('🔄 Refreshing commands (delete + register)...');
    
    await deleteAllCommands(guildId);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    await registerCommands(guildId);
    
    console.log('✅ Commands refreshed successfully');
  } catch (error) {
    console.error('❌ Command refresh failed:', error);
    throw error;
  }
}

// For direct execution via npm script
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const guildId = args[1];

  switch (command) {
    case 'register':
      registerCommands(guildId).catch(console.error);
      break;
    case 'delete':
      deleteAllCommands(guildId).catch(console.error);
      break;
    case 'list':
      listCommands(guildId).catch(console.error);
      break;
    case 'refresh':
      refreshCommands(guildId).catch(console.error);
      break;
    case 'dev':
      quickRegisterDev().catch(console.error);
      break;
    default:
      console.log('Usage: npm run deploy [register|delete|list|refresh|dev] [guildId]');
      console.log('Examples:');
      console.log('  npm run deploy register           # Register globally');
      console.log('  npm run deploy register 123456    # Register for specific guild');
      console.log('  npm run deploy delete             # Delete all global commands');
      console.log('  npm run deploy list               # List global commands');
      console.log('  npm run deploy dev                # Quick dev register');
  }
}