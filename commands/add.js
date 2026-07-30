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
import SquadModel from '../schemas/squadSchema.js';

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

function buildPlayerEmbed(userPlayer, index, total) {
  const p = userPlayer.player_id;
  const s = p.stats || {};
  const { embedUrl, files } = getPlayerImageAttachment(p.image);

  const allPositions = [p.position, ...(p.secondaryPositions ?? [])].filter(Boolean);
  const positionsStr = allPositions.map(pos => `\`${pos}\``).join('  ');

  const embed = new EmbedBuilder()
    .setColor(0xaa1c5f)
    .setTitle(`Select the card you want to add to your team`)
    .setDescription(
      `${positionsStr ? `**${positionsStr}**  ·  ` : ''}⭐ **${p.overall}**\n` +
      `${p.club?.name || ''}${p.nation?.name ? `  ·  ${p.nation.name}` : ''}\n\n` +
      `\`PAC ${s.pac ?? '—'}\`  \`SHO ${s.sho ?? '—'}\`  \`PAS ${s.pas ?? '—'}\`  \`DRI ${s.dri ?? '—'}\`  \`DEF ${s.def ?? '—'}\`  \`PHY ${s.phy ?? '—'}\``
    )
    .setImage(embedUrl)
    .setFooter({ text: `Card ${index + 1} of ${total} • 1 minute to make a choice` });

  return { embed, files };
}

function buildActionRow(index, total) {
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId('next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(!hasNext),
    new ButtonBuilder().setCustomId('confirm_add').setLabel('✅ Add to Squad').setStyle(ButtonStyle.Success)
  );
}

function sendErrorEmbed(interaction, reason) {
  const embed = new EmbedBuilder()
    .setColor(0xaa1c5f)
    .setTitle(`⚠️ Can't add player to your team`)
    .setDescription(`**Reason:** ${reason}\n\n` +
      `Possible reasons generally include:\n` +
      `◉ The exact player is already in your team\n` +
      `◉ Your team already has 11 players\n` +
      `◉ You don't have this player in your inventory`);
      
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('add')
  .setDescription('Add a player to your active squad')
  .addStringOption(opt =>
    opt.setName('player')
      .setDescription('The name of the player you want to add')
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
      up.player_id && up.player_id.name.toLowerCase() === query.toLowerCase()
    );

    if (matchingPlayers.length === 0) {
      return sendErrorEmbed(interaction, `You don't have a player named **${query}** in your collection.`);
    }

    // 3. Fetch or Create Squad
    let squad = await SquadModel.findOne({ user_id: webUser._id, isActive: true });
    if (!squad) {
      squad = await SquadModel.create({
        user_id: webUser._id,
        name: 'My Squad',
        isActive: true,
        startingEleven: []
      });
    }

    if (squad.startingEleven.length >= 11) {
      return sendErrorEmbed(interaction, `Your starting eleven already has 11 players.`);
    }

    // Function to handle the actual adding logic
    const addToSquad = async (userPlayer, iHandler) => {
      // Check if already in squad
      const alreadyInSquad = squad.startingEleven.some(
        slot => slot.user_player_id?.toString() === userPlayer._id.toString()
      );
      if (alreadyInSquad) {
        const err = new EmbedBuilder().setColor(0xaa1c5f).setDescription('⚠️ This exact card is already in your squad.');
        return iHandler.reply ? iHandler.reply({ embeds: [err], flags: MessageFlags.Ephemeral }) : iHandler.update({ embeds: [err], components: [], files: [] });
      }

      // Find first empty position index (0 to 10)
      const usedIndexes = squad.startingEleven.map(s => s.positionIndex);
      let freeIndex = 0;
      while (usedIndexes.includes(freeIndex) && freeIndex < 11) {
        freeIndex++;
      }

      squad.startingEleven.push({
        positionIndex: freeIndex,
        user_player_id: userPlayer._id
      });

      await squad.save();

      const successEmbed = new EmbedBuilder()
        .setColor(0xaa1c5f)
        .setDescription(`✅ **${userPlayer.player_id.name}** has been added to your team.`);

      if (iHandler.reply) {
        return iHandler.reply({ embeds: [successEmbed], flags: MessageFlags.Ephemeral });
      } else {
        return iHandler.update({ embeds: [successEmbed], components: [], files: [] });
      }
    };

    // If only one match, auto-add
    if (matchingPlayers.length === 1) {
      return addToSquad(matchingPlayers[0], interaction);
    }

    // If multiple copies, show pagination
    let currentIndex = 0;
    const { embed, files } = buildPlayerEmbed(matchingPlayers[currentIndex], currentIndex, matchingPlayers.length);
    const row = buildActionRow(currentIndex, matchingPlayers.length);

    const message = await interaction.reply({
      embeds: [embed],
      components: [row],
      files,
      fetchReply: true,
      flags: MessageFlags.Ephemeral
    });

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      if (i.customId === 'prev' || i.customId === 'next') {
        currentIndex = i.customId === 'next'
          ? Math.min(currentIndex + 1, matchingPlayers.length - 1)
          : Math.max(currentIndex - 0, 0);

        const { embed: updatedEmbed, files: updatedFiles } = buildPlayerEmbed(matchingPlayers[currentIndex], currentIndex, matchingPlayers.length);
        await i.update({ embeds: [updatedEmbed], components: [buildActionRow(currentIndex, matchingPlayers.length)], files: updatedFiles });
      } else if (i.customId === 'confirm_add') {
        collector.stop('confirmed');
        await addToSquad(matchingPlayers[currentIndex], i);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'confirmed') {
        interaction.editReply({ components: [] }).catch(() => {});
      }
    });

  } catch (error) {
    console.error('Error in /add command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
