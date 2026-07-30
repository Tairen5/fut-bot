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
import { updateMissionProgress } from '../utils/missions.js';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';
const COLLECTOR_TIMEOUT = 30_000;

// Tabla de precios de compra (el precio de venta rápida será la mitad)
const PRICE_TABLE = [
  { min: 95, price: 10_000_000 },
  { min: 93, price:  4_000_000 },
  { min: 91, price:  1_000_000 },
  { min: 90, price:    600_000 },
  { min: 88, price:    300_000 },
  { min: 87, price:    150_000 },
  { min: 85, price:     75_000 },
  { min: 84, price:     40_000 },
  { min: 83, price:     20_000 },
  { min: 82, price:     10_000 },
  { min: 0,  price:      5_000 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getSellPrice(overall) {
  const buyPrice = (PRICE_TABLE.find(t => overall >= t.min) ?? PRICE_TABLE.at(-1)).price;
  return Math.floor(buyPrice / 2); // Quick sell is 50% of the buy price
}

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
  const sellPrice = getSellPrice(p.overall);
  const { embedUrl, files } = getPlayerImageAttachment(p.image);

  const embed = new EmbedBuilder()
    .setColor(0xaa1c5f)
    .setTitle(`Select the card to sell:`)
    .setDescription(
      `⭐ **${p.overall}**  ·  **${p.name}**\n\n` +
      `💰 Sell Price: **${sellPrice.toLocaleString()} coins**`
    )
    .setImage(embedUrl)
    .setFooter({ text: `Card ${index + 1} of ${total} • 30 seconds to confirm` });

  return { embed, files };
}

function buildActionRow(index, total) {
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev),
    new ButtonBuilder().setCustomId('next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(!hasNext),
    new ButtonBuilder().setCustomId('confirm_sell').setLabel('✅ Sell').setStyle(ButtonStyle.Success)
  );
}

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('sell')
  .setDescription('Sell a player from your club for coins')
  .addStringOption(opt =>
    opt.setName('player')
      .setDescription('The name of the player you want to sell')
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
    const allUserPlayers = await UserPlayerModel.find({ user_id: webUser._id })
      .populate('player_id')
      .lean();

    const matchingPlayers = allUserPlayers.filter(up => 
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

    // 3. Prevent selling players that are currently in the active squad
    const activeSquad = await SquadModel.findOne({ user_id: webUser._id, isActive: true }).lean();
    let equippedIds = new Set();
    if (activeSquad) {
      (activeSquad.startingEleven || []).forEach(slot => {
        if (slot.user_player_id) equippedIds.add(slot.user_player_id.toString());
      });
      (activeSquad.bench || []).forEach(benchId => {
        if (benchId) equippedIds.add(benchId.toString());
      });
    }

    // Filter out equipped players
    const sellablePlayers = matchingPlayers.filter(up => !equippedIds.has(up._id.toString()));

    if (sellablePlayers.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xaa1c5f)
            .setTitle('Player in Squad')
            .setDescription(`You own **${query}**, but they are currently in your active squad.\nRemove them from the squad using the web app or another command before selling.`)
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // 4. Setup pagination
    let currentIndex = 0;
    const { embed, files } = buildPlayerEmbed(sellablePlayers[currentIndex], currentIndex, sellablePlayers.length);
    const row = buildActionRow(currentIndex, sellablePlayers.length);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      files,
      flags: MessageFlags.Ephemeral
    });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      if (i.customId === 'prev' || i.customId === 'next') {
        currentIndex = i.customId === 'next'
          ? Math.min(currentIndex + 1, sellablePlayers.length - 1)
          : Math.max(currentIndex - 1, 0);

        const { embed: updatedEmbed, files: updatedFiles } = buildPlayerEmbed(sellablePlayers[currentIndex], currentIndex, sellablePlayers.length);
        
        await i.update({
          embeds: [updatedEmbed],
          components: [buildActionRow(currentIndex, sellablePlayers.length)],
          files: updatedFiles
        });
      } else if (i.customId === 'confirm_sell') {
        collector.stop('sold');

        const userPlayerToSell = sellablePlayers[currentIndex];
        const p = userPlayerToSell.player_id;
        const sellPrice = getSellPrice(p.overall);

        // Delete from collection
        await UserPlayerModel.findByIdAndDelete(userPlayerToSell._id);

        // Add coins to user
        const freshUser = await UserModel.findOneAndUpdate(
          { discordId },
          { $inc: { currency: sellPrice } },
          { returnDocument: 'after' }
        );

        // Update SELL_PLAYERS mission progress
        await updateMissionProgress(webUser._id, 'SELL_PLAYERS');

        const { embedUrl, files: successFiles } = getPlayerImageAttachment(p.image);
        
        const successEmbed = new EmbedBuilder()
          .setColor(0xaa1c5f)
          .setTitle('Player sold')
          .setDescription(
            `**${p.name}** has been sold for \`${sellPrice.toLocaleString()}\` coins.\n` +
            `💰 New balance: **${freshUser.currency.toLocaleString()} coins**`
          )
          .setImage(embedUrl);

        await i.update({ embeds: [successEmbed], components: [], files: successFiles });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'sold') {
        const timeoutEmbed = new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Sale time expired')
          .setDescription('The time to select a character has expired.');
        interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
      }
    });

  } catch (error) {
    console.error('Error in /sell command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
