import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  AttachmentBuilder
} from 'discord.js';
import fs from 'fs';
import path from 'path';

import UserModel from '../schemas/userSchema.js';
import UserPlayerModel from '../schemas/userPlayerSchema.js';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';
const COLLECTOR_TIMEOUT = 60_000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getPlayerImageAttachment(imageName) {
  if (!imageName) return { embedUrl: 'https://i.imgur.com/8m4Y4zX.png', files: [] };
  if (imageName.startsWith('http')) return { embedUrl: imageName, files: [] };

  const localPath = path.join(CARDS_LOCAL_PATH, imageName);
  if (fs.existsSync(localPath)) {
    const attachment = new AttachmentBuilder(localPath, { name: imageName });
    return { embedUrl: `attachment://${imageName}`, files: [attachment] };
  }

  const baseUrl = process.env.ASSETS_BASE_URL || 'http://localhost:5173';
  return { embedUrl: `${baseUrl}/player-cards/${imageName}`, files: [] };
}

function getEmbedColor(overall) {
  if (overall >= 95) return 0xffd700;
  if (overall >= 90) return 0xc9a752;
  if (overall >= 85) return 0x22c55e;
  if (overall >= 80) return 0x4f8ef7;
  return 0x888888;
}

function buildPlayerEmbed(userPlayer, index, total, interaction) {
  const p = userPlayer.player_id;
  const s = p.stats || {};
  const ms = userPlayer.matchStats || { matchesPlayed: 0, goals: 0, assists: 0 };
  
  const { embedUrl, files } = getPlayerImageAttachment(p.image);

  const allPositions = [p.position, ...(p.secondaryPositions ?? [])].filter(Boolean);
  const positionsStr = allPositions.map(pos => `\`${pos}\``).join('  ');

  // Tradeable status
  const tradeStatus = userPlayer.isTradeable ? '🟢 Tradeable' : '🔴 Untradeable';

  const embed = new EmbedBuilder()
    .setColor(getEmbedColor(p.overall))
    .setAuthor({ name: `Owned by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
    .setTitle(`${p.name}${p.promo ? `  ·  ${p.promo}` : ''}`)
    .setDescription(
      `${positionsStr ? `**${positionsStr}**  ·  ` : ''}⭐ **${p.overall}**\n` +
      `${p.club?.name || ''}${p.nation?.name ? `  ·  ${p.nation.name}` : ''}\n\n` +
      `**📊 Match Stats**\n` +
      `\`Games:\` ${ms.matchesPlayed}   \`Goals:\` ${ms.goals}   \`Assists:\` ${ms.assists}\n\n` +
      `**⚽ Attributes**\n` +
      `\`PAC ${s.pac ?? '—'}\`  \`SHO ${s.sho ?? '—'}\`  \`PAS ${s.pas ?? '—'}\`  \`DRI ${s.dri ?? '—'}\`  \`DEF ${s.def ?? '—'}\`  \`PHY ${s.phy ?? '—'}\`\n\n` +
      `*${tradeStatus}*`
    )
    .setImage(embedUrl)
    .setFooter({ text: `Card ${index + 1} of ${total} • Acquired: ${new Date(userPlayer.createdAt).toLocaleDateString('en-US')}` });

  return { embed, files };
}

function buildActionRow(index, total) {
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasPrev),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasNext)
  );
}

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('view')
  .setDescription('View detailed information of a player in your collection')
  .addStringOption(opt =>
    opt.setName('player')
      .setDescription('The name of the player you want to view')
      .setRequired(true)
  );

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const query = interaction.options.getString('player').trim();

  try {
    // 1. Fetch user
    const webUser = await UserModel.findOne({ discordId });
    if (!webUser) {
      return interaction.reply({
        content: '❌ Profile not found. Log in at the website first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Fetch inventory matching name
    const inventory = await UserPlayerModel.find({ user_id: webUser._id })
      .populate('player_id')
      .lean();

    const matchingPlayers = inventory.filter(up => 
      up.player_id && up.player_id.name.toLowerCase().includes(query.toLowerCase())
    );

    if (matchingPlayers.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xaa1c5f)
            .setDescription(`You don't have any player named **${query}** in your collection.`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // 3. Setup pagination
    let currentIndex = 0;
    const { embed, files } = buildPlayerEmbed(matchingPlayers[currentIndex], currentIndex, matchingPlayers.length, interaction);
    
    const components = matchingPlayers.length > 1 
      ? [buildActionRow(currentIndex, matchingPlayers.length)]
      : [];

    const message = await interaction.reply({
      embeds: [embed],
      components,
      files,
      withResponse: true
    });

    if (matchingPlayers.length <= 1) return; // No need for collector if only 1 match

    // 4. Collector for pagination
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      currentIndex = i.customId === 'next'
        ? Math.min(currentIndex + 1, matchingPlayers.length - 1)
        : Math.max(currentIndex - 1, 0);

      const { embed: updatedEmbed, files: updatedFiles } = buildPlayerEmbed(matchingPlayers[currentIndex], currentIndex, matchingPlayers.length, interaction);
      
      await i.update({
        embeds: [updatedEmbed],
        components: [buildActionRow(currentIndex, matchingPlayers.length)],
        files: updatedFiles
      });
    });

    collector.on('end', () => {
      const disabledRow = buildActionRow(currentIndex, matchingPlayers.length);
      disabledRow.components.forEach(c => c.setDisabled(true));
      interaction.editReply({ components: [disabledRow] }).catch(() => {});
    });

  } catch (error) {
    console.error('Error in /view command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
