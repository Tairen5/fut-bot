import { MessageFlags } from 'discord.js';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return;

  const client = interaction.client;
  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`No se encontró ningún comando coincidente para ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error al ejecutar el comando ${interaction.commandName}:`, error);
    const replyOptions = { content: 'Hubo un error al ejecutar este comando.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(replyOptions);
    } else {
      await interaction.reply(replyOptions);
    }
  }
}
