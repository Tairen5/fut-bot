import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function loadCommands(client) {
  client.commands = new Collection();
  const commandsPath = path.join(__dirname, '../commands');
  
  if (!fs.existsSync(commandsPath)) {
    console.warn('La carpeta commands/ no existe.');
    return;
  }

  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const fileURL = pathToFileURL(filePath).href;
    const command = await import(fileURL);

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`[COMANDO] Cargado: ${command.data.name}`);
    } else {
      console.warn(`[WARNING] El comando en ${filePath} no tiene las propiedades obligatorias "data" o "execute".`);
    }
  }
}
