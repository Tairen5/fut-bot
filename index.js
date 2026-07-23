import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import loadCommands from './handlers/commandHandler.js';
import loadEvents from './handlers/eventHandler.js';

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
  console.error('Error: DISCORD_TOKEN no está definido en el archivo .env');
  process.exit(1);
}

// Conectar a MongoDB
try {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/futbot';
  await mongoose.connect(mongoUri);
  console.log('¡Conectado exitosamente a MongoDB!');
} catch (error) {
  console.error('Error al conectar a MongoDB:', error);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ]
});

// Cargar comandos y eventos dinámicamente
await loadCommands(client);
await loadEvents(client);

client.login(process.env.DISCORD_TOKEN);

