import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('hello')
  .setDescription('Responds with a simple greeting.');

export async function execute(interaction) {
  // Responde con un saludo de prueba en inglés
  await interaction.reply({
    content: 'Hello! This is a test message from your new FUT Web Discord bot.',
    flags: MessageFlags.Ephemeral
  });
}
