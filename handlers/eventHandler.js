import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function loadEvents(client) {
  const eventsPath = path.join(__dirname, '../events');
  
  if (!fs.existsSync(eventsPath)) {
    console.warn('La carpeta events/ no existe.');
    return;
  }

  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const fileURL = pathToFileURL(filePath).href;
    const event = await import(fileURL);

    if ('name' in event && 'execute' in event) {
      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }
      console.log(`[EVENTO] Cargado: ${event.name}`);
    } else {
      console.warn(`[WARNING] El evento en ${filePath} no tiene las propiedades obligatorias "name" o "execute".`);
    }
  }
}
