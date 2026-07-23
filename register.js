import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const fileURL = pathToFileURL(filePath).href;
    const command = await import(fileURL);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function registerCommands() {
  try {
    console.log('Empezando a registrar los comandos slash (/) de la aplicación...');

    if (process.env.GUILD_ID) {
      // Registrar solo para un servidor específico (más rápido para desarrollo/pruebas)
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log('Comandos registrados exitosamente para el servidor local (Guild ID).');
    } else {
      // Registrar globalmente
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log('Comandos registrados exitosamente a nivel global.');
    }
  } catch (error) {
    console.error('Error al registrar comandos:', error);
  }
}

registerCommands();

