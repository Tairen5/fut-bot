import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import UserModel from '../schemas/userSchema.js';

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('balance')
  .setDescription("Shows your current coin balance");

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const discordId = interaction.user.id;

  try {
    const webUser = await UserModel.findOne({ discordId });

    if (!webUser) {
      return interaction.reply({
        content: '❌ Your Discord account is not linked to the web yet. Log in at the website first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const { currency, elo, record } = webUser;
    const { wins = 0, draws = 0, losses = 0 } = record ?? {};
    const totalMatches = wins + draws + losses;

    const embed = new EmbedBuilder()
      .setColor(0xaa1c5f)
      .setAuthor({
        name: interaction.user.username,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTitle('💰 Balance')
      .setDescription(`<@${discordId}> has **${currency.toLocaleString()} coins**`)
      .addFields(
        { name: 'ELO',     value: `\`${elo}\``,          inline: true },
        { name: 'Matches', value: `\`${totalMatches}\``,  inline: true },
        { name: 'Record',  value: `\`${wins}W / ${draws}D / ${losses}L\``, inline: true },
      )
      .setFooter({ text: 'Earn coins by playing matches and claiming players!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error executing /balance:', error);
    await interaction.reply({
      content: 'An internal error occurred. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
