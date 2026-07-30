import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  AttachmentBuilder
} from 'discord.js';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

import UserModel from '../schemas/userSchema.js';
import PackModel from '../schemas/packSchema.js';
import UserPlayerModel from '../schemas/userPlayerSchema.js';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';
const COLLECTOR_TIMEOUT = 60_000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getEmbedColorByImage(imageStr) {
  const map = {
    bronze: 0xcd7f32,
    silver: 0xc0c0c0,
    gold: 0xffd700,
    premium: 0x9333ea // Purple for premium
  };
  return map[imageStr?.toLowerCase()] || 0xaa1c5f;
}

function getPlayerImageAttachment(imageName) {
  if (!imageName) return null;
  if (imageName.startsWith('http')) return { url: imageName, attachment: null };

  const localPath = path.join(CARDS_LOCAL_PATH, imageName);
  if (fs.existsSync(localPath)) {
    const attachment = new AttachmentBuilder(localPath, { name: imageName });
    return { url: `attachment://${imageName}`, attachment };
  }

  const baseUrl = process.env.ASSETS_BASE_URL || 'http://localhost:5173';
  return { url: `${baseUrl}/player-cards/${imageName}`, attachment: null };
}

function getPlayerImagePath(imageName) {
  if (!imageName) return 'https://i.imgur.com/8m4Y4zX.png';
  if (imageName.startsWith('http')) return imageName;

  const localPath = path.join(CARDS_LOCAL_PATH, imageName);
  if (fs.existsSync(localPath)) {
    return localPath; 
  }

  const baseUrl = process.env.ASSETS_BASE_URL || 'http://localhost:5173';
  return `${baseUrl}/player-cards/${imageName}`;
}

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('packs')
  .setDescription('Open the store to buy packs and pull new players for your club');

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const discordId = interaction.user.id;

  try {
    // 1. Fetch user
    const webUser = await UserModel.findOne({ discordId });
    if (!webUser) {
      return interaction.reply({
        content: '❌ Profile not found. Log in at the website first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Fetch all store packs from DB
    const storePacks = await PackModel.find({ availableInStore: true }).populate('possibleCards.player_id').lean();
    if (storePacks.length === 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xaa1c5f)
            .setTitle('Pack Store')
            .setDescription('The store is currently empty! No packs are available right now.')
        ],
        flags: MessageFlags.Ephemeral
      });
    }

    // 3. Build Store Embed
    const storeEmbed = new EmbedBuilder()
      .setColor(0xaa1c5f)
      .setTitle('🛒 Pack Store')
      .setDescription(`Welcome to the store! Select a pack to open.\nYour balance: **${webUser.currency.toLocaleString()} coins**\n\n`)
      .setThumbnail('https://imgur.com/ArczBYC.png'); // Placeholder store icon

    storePacks.forEach(pack => {
      storeEmbed.addFields({
        name: `${pack.name} — 🪙 ${pack.price.toLocaleString()} coins`,
        value: `Contains ${pack.numCards} random players.`
      });
    });

    // 4. Build Select Menu
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_pack')
      .setPlaceholder('Choose a pack to open...')
      .addOptions(
        storePacks.map(pack => ({
          label: pack.name,
          description: `${pack.numCards} cards • ${pack.price.toLocaleString()} coins`,
          value: pack._id.toString()
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      embeds: [storeEmbed],
      components: [row]
    });
    const message = await interaction.fetchReply();

    // 5. Collector
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      if (i.customId === 'select_pack') {
        const selectedPackId = i.values[0];
        const selectedPack = storePacks.find(p => p._id.toString() === selectedPackId);
        
        // Re-fetch user to get latest balance
        const freshUser = await UserModel.findOne({ discordId });

        if (!selectedPack.possibleCards || selectedPack.possibleCards.length === 0) {
          return i.reply({
            content: `This pack is currently empty in the database. Please try another one.`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (freshUser.currency < selectedPack.price) {
          return i.reply({
            content: `You don't have enough coins! You need **${(selectedPack.price - freshUser.currency).toLocaleString()}** more coins for the ${selectedPack.name}.`,
            flags: MessageFlags.Ephemeral
          });
        }

        // Processing overlay message
        await i.update({
          embeds: [
            new EmbedBuilder()
              .setColor(getEmbedColorByImage(selectedPack.image))
              .setTitle(`Opening ${selectedPack.name}...`)
              .setDescription('Good luck!')
          ],
          components: []
        });

        // 6. Deduct balance and Open Pack Logic
        freshUser.currency -= selectedPack.price;
        await freshUser.save();

        const totalWeight = selectedPack.possibleCards.reduce((sum, c) => sum + c.weight, 0);
        const pulledPlayers = [];

        for (let n = 0; n < selectedPack.numCards; n++) {
          let rand = Math.random() * totalWeight;
          let chosen = selectedPack.possibleCards[0];
          for (const card of selectedPack.possibleCards) {
            rand -= card.weight;
            if (rand <= 0) {
              chosen = card;
              break;
            }
          }
          pulledPlayers.push(chosen.player_id);
        }

        if (selectedPack.type === 'draft') {
          // --- DRAFT LOGIC ---
          const canvasWidth = Math.max(850, pulledPlayers.length * 270);
          const canvasHeight = 400;
          const canvas = createCanvas(canvasWidth, canvasHeight);
          const ctx = canvas.getContext('2d');
          
          // Transparent or dark background
          ctx.fillStyle = '#1e1e1e';
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);

          const cardWidth = 250;
          const cardHeight = 350;
          const startX = (canvasWidth - (pulledPlayers.length * cardWidth + (pulledPlayers.length - 1) * 20)) / 2;

          for (let i = 0; i < pulledPlayers.length; i++) {
            const player = pulledPlayers[i];
            const imgPath = getPlayerImagePath(player.image);
            try {
              const img = await loadImage(imgPath);
              const x = startX + i * (cardWidth + 20);
              const y = 10;
              ctx.drawImage(img, x, y, cardWidth, cardHeight);
              
              // Draw "1", "2", "3" labels below
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 30px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(`${i + 1}`, x + cardWidth / 2, y + cardHeight + 30);
            } catch (err) {
              console.error('Error loading draft image:', err);
            }
          }

          const buffer = canvas.toBuffer('image/png');
          const attachment = new AttachmentBuilder(buffer, { name: 'draft.png' });

          const draftEmbed = new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle(`Player Pick!`)
            .setDescription(`You have opened a **${selectedPack.name}**.\nChoose **1** player to keep by clicking the buttons below.`)
            .setImage('attachment://draft.png');

          const draftRow = new ActionRowBuilder();
          for (let i = 0; i < pulledPlayers.length; i++) {
            draftRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`draft_pick_${i}`)
                .setLabel(`Keep Player ${i + 1}`)
                .setStyle(ButtonStyle.Primary)
            );
          }

          const draftMsg = await i.editReply({
            embeds: [draftEmbed],
            components: [draftRow],
            files: [attachment]
          });

          // Collector for the draft selection
          const draftCollector = draftMsg.createMessageComponentCollector({
            filter: btnInt => btnInt.user.id === discordId && btnInt.customId.startsWith('draft_pick_'),
            time: 60000
          });

          draftCollector.on('collect', async btnInt => {
            const selectedIdx = parseInt(btnInt.customId.split('_').pop());
            const chosenPlayer = pulledPlayers[selectedIdx];

            // Save only the chosen player to DB
            await UserPlayerModel.create({
              user_id: freshUser._id,
              player_id: chosenPlayer._id,
              isTradeable: true
            });

            // Update UI
            draftEmbed.setDescription(`✅ You chose **${chosenPlayer.name}** (${chosenPlayer.overall})! They have been added to your club.`);
            draftEmbed.setColor(0x22c55e);
            
            // Disable buttons
            draftRow.components.forEach(c => c.setDisabled(true));

            await btnInt.update({ embeds: [draftEmbed], components: [draftRow] });
            draftCollector.stop('selected');
          });

          draftCollector.on('end', (_, reason) => {
            if (reason !== 'selected') {
              draftEmbed.setDescription('❌ You took too long to choose. The pack expired and no players were added (Coins lost).');
              draftEmbed.setColor(0xff0000);
              draftRow.components.forEach(c => c.setDisabled(true));
              interaction.editReply({ embeds: [draftEmbed], components: [draftRow] }).catch(() => {});
            }
          });

          collector.stop('opened');
          return;
        }

        // --- STANDARD PACK LOGIC ---
        // 7. Save pulled players to DB
        const userPlayersData = pulledPlayers.map(player => ({
          user_id: freshUser._id,
          player_id: player._id,
          isTradeable: true
        }));
        await UserPlayerModel.insertMany(userPlayersData);

        // 8. Build Result Embeds
        const files = [];
        const resultEmbeds = pulledPlayers.map((player, idx) => {
          const imgData = getPlayerImageAttachment(player.image);
          let embedUrl = null;
          
          if (imgData) {
            embedUrl = imgData.url;
            if (imgData.attachment) {
              // Ensure attachments have unique names if same player is pulled twice
              const ext = player.image.split('.').pop() || 'png';
              const safeName = `pull_${idx}_${player._id}.${ext}`;
              imgData.attachment.setName(safeName);
              embedUrl = `attachment://${safeName}`;
              files.push(imgData.attachment);
            }
          }

          const embed = new EmbedBuilder()
            .setColor(getEmbedColorByImage(selectedPack.image))
            .setTitle(`You pulled: ${player.name}!`)
            .setDescription(`⭐ **${player.overall}** • ${player.position}\n${player.club?.name || ''}`)
            .setFooter({ text: `Card ${idx + 1} of ${pulledPlayers.length}` });

          if (embedUrl) embed.setThumbnail(embedUrl);
          
          return embed;
        });

        const summaryEmbed = new EmbedBuilder()
          .setColor(0x22c55e) // Green
          .setDescription(`Your new balance: **${freshUser.currency.toLocaleString()} coins**`)
          .setFooter({ text: 'Cards added to your club!' });

        resultEmbeds.push(summaryEmbed);

        // Delay slightly for effect
        setTimeout(async () => {
          await interaction.editReply({
            embeds: resultEmbeds,
            files: files
          });
        }, 2000);

        collector.stop('opened');
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'opened') {
        const timeoutEmbed = EmbedBuilder.from(storeEmbed)
          .setDescription('The store menu timed out. Run the command again to buy packs.');
        interaction.editReply({ embeds: [timeoutEmbed], components: [] }).catch(() => {});
      }
    });

  } catch (error) {
    console.error('Error in /packs command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
