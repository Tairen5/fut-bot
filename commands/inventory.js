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
import UserPackModel from '../schemas/userPackSchema.js';
import { updateMissionProgress } from '../utils/missions.js';

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
  .setName('inventory')
  .setDescription('Open packs from your inventory');

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const discordId = interaction.user.id;

  try {
    const webUser = await UserModel.findOne({ discordId });
    if (!webUser) {
      return interaction.reply({
        content: '❌ Profile not found. Log in at the website first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    async function showInventoryMenu(iToUpdate = null) {
      const userPacks = await UserPackModel.find({ user_id: webUser._id, quantity: { $gt: 0 } }).populate('pack_id').lean();
      
      if (userPacks.length === 0) {
        const emptyData = {
          embeds: [
            new EmbedBuilder()
              .setColor(0xaa1c5f)
              .setTitle('🎒 Pack Inventory')
              .setDescription('You don\'t have any packs in your inventory!\nBuy some using `/store`.')
          ],
          components: []
        };
        
        if (iToUpdate) {
          return iToUpdate.update(emptyData);
        } else {
          return interaction.reply(Object.assign({}, emptyData, { flags: MessageFlags.Ephemeral }));
        }
      }

      const invEmbed = new EmbedBuilder()
        .setColor(0xaa1c5f)
        .setTitle('🎒 Pack Inventory')
        .setDescription(`Select a pack to open. You have **${userPacks.reduce((sum, up) => sum + up.quantity, 0)}** total packs.\n\n`)
        .setThumbnail('https://imgur.com/ArczBYC.png');

      userPacks.forEach(up => {
        invEmbed.addFields({
          name: `${up.pack_id.name} (x${up.quantity})`,
          value: `Contains ${up.pack_id.numCards} ${up.pack_id.type === 'draft' ? 'choices' : 'cards'}.`
        });
      });

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('select_inv_pack')
        .setPlaceholder('Choose a pack to open...')
        .addOptions(
          userPacks.map(up => ({
            label: up.pack_id.name,
            description: `You have ${up.quantity} of these`,
            value: up.pack_id._id.toString()
          }))
        );

      const row = new ActionRowBuilder().addComponents(selectMenu);

      if (iToUpdate) {
        await iToUpdate.update({ embeds: [invEmbed], components: [row] });
        return null;
      } else {
        await interaction.reply({ embeds: [invEmbed], components: [row] });
        return await interaction.fetchReply();
      }
    }

    const message = await showInventoryMenu();
    if (!message) return; // Means inventory was empty initially

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT * 5, // Allow more time since they might open multiple
    });

    collector.on('collect', async i => {
      if (i.customId === 'back_to_inventory') {
        await showInventoryMenu(i);
        return;
      }

      if (i.customId === 'select_inv_pack') {
        const selectedPackId = i.values[0];
        
        const userPack = await UserPackModel.findOne({ user_id: webUser._id, pack_id: selectedPackId }).populate({
          path: 'pack_id',
          populate: { path: 'possibleCards.player_id' }
        });

        if (!userPack || userPack.quantity <= 0) {
          return i.reply({
            content: `You don't have any of this pack left!`,
            flags: MessageFlags.Ephemeral
          });
        }

        const selectedPack = userPack.pack_id;

        if (!selectedPack.possibleCards || selectedPack.possibleCards.length === 0) {
          return i.reply({
            content: `This pack is currently empty in the database. Please try another one.`,
            flags: MessageFlags.Ephemeral
          });
        }

        // Deduct from inventory
        userPack.quantity -= 1;
        await userPack.save();

        // Update OPEN_PACKS mission progress
        await updateMissionProgress(webUser._id, 'OPEN_PACKS');

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

            await UserPlayerModel.create({
              user_id: webUser._id,
              player_id: chosenPlayer._id,
              isTradeable: true
            });

            draftEmbed.setDescription(`✅ You chose **${chosenPlayer.name}** (${chosenPlayer.overall})! They have been added to your club.`);
            draftEmbed.setColor(0x22c55e);
            
            const backRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('back_to_inventory')
                .setLabel('Back to Inventory')
                .setStyle(ButtonStyle.Secondary)
            );

            await btnInt.update({ embeds: [draftEmbed], components: [backRow] });
            draftCollector.stop('selected');
          });

          draftCollector.on('end', (_, reason) => {
            if (reason !== 'selected') {
              draftEmbed.setDescription('❌ You took too long to choose. The pack expired and no players were added (Pack lost).');
              draftEmbed.setColor(0xff0000);
              
              const backRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('back_to_inventory')
                  .setLabel('Back to Inventory')
                  .setStyle(ButtonStyle.Secondary)
              );
              
              interaction.editReply({ embeds: [draftEmbed], components: [backRow] }).catch(() => {});
            }
          });
          
          return; // Wait for back button handled by main collector
        }

        // --- STANDARD PACK LOGIC ---
        const userPlayersData = pulledPlayers.map(player => ({
          user_id: webUser._id,
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
        
        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('back_to_inventory')
            .setLabel('Back to Inventory')
            .setStyle(ButtonStyle.Secondary)
        );

        setTimeout(async () => {
          await interaction.editReply({
            embeds: resultEmbeds,
            files: files,
            components: [backRow]
          });
        }, 2000);
      }
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });

  } catch (error) {
    console.error('Error in /packs command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
