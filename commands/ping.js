import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check the bot latency.');

export async function execute(interaction) {
  // Comprueba y responde con la latencia del bot en inglés
  const latency = Date.now() - interaction.createdTimestamp;
  await interaction.reply({
    content: `🏓 Pong! Latency is ${latency}ms.`,
    flags: MessageFlags.Ephemeral
  });
}
