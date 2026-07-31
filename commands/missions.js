import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } from 'discord.js';
import { createCanvas } from 'canvas';

import UserModel from '../schemas/userSchema.js';
import ObjectiveModel from '../schemas/objectiveSchema.js';
import UserObjectiveModel from '../schemas/userObjectiveSchema.js';
import UserPackModel from '../schemas/userPackSchema.js';

export const data = new SlashCommandBuilder()
  .setName('missions')
  .setDescription('Check your Blue Lock evaluation missions and claim rewards');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  try {
    const webUser = await UserModel.findOne({ discordId });
    if (!webUser) {
      return interaction.reply({ content: '❌ Profile not found. Log in at the website first.', flags: MessageFlags.Ephemeral });
    }

    // Get all active objectives
    const activeObjectives = await ObjectiveModel.find({ isActive: true }).lean();
    if (activeObjectives.length === 0) {
      return interaction.reply({ content: 'There are no active missions right now.', flags: MessageFlags.Ephemeral });
    }

    // Get user progress
    const userObjectives = await UserObjectiveModel.find({ user_id: webUser._id }).lean();
    const progressMap = new Map();
    userObjectives.forEach(uo => {
      progressMap.set(uo.objective_id.toString(), uo);
    });

    // Icon based on progress level
    function getProgressIcon(progress, target, isClaimed) {
      if (isClaimed) return '☑'; // claimed
      const ratio = progress / target;
      if (ratio <= 0) return '□'; // empty square - 0%
      if (ratio < 0.33) return '◇'; // empty diamond - low
      if (ratio < 0.66) return '◈'; // half diamond - mid
      if (ratio < 1) return '◆'; // full diamond - almost done
      return '☒';                     // X square - complete, unclaimed
    }

    // Count overall completion for footer
    let completedCount = 0;
    for (const obj of activeObjectives) {
      const uo = progressMap.get(obj._id.toString());
      if (uo && uo.progress >= obj.targetValue) completedCount++;
    }

    const avatarUrl = interaction.user.displayAvatarURL({ size: 64 });

    const embed = new EmbedBuilder()
      .setColor(0x0e50e6)
      .setAuthor({
        name: `${interaction.user.username} · Misiones Diarias`,
        iconURL: avatarUrl
      });

    const row = new ActionRowBuilder();
    let hasClaimable = false;

    // Generate Canvas 2x2 Grid
    const columns = 2;
    const rows = Math.ceil(activeObjectives.length / columns);
    const cardWidth = 440;
    const cardHeight = 190;
    const gap = 24;
    const padding = 36;
    const footerH = 40;
    
    const canvasWidth = padding * 2 + (cardWidth * columns) + gap;
    const canvasHeight = padding * 2 + (cardHeight * rows) + ((rows - 1) * gap) + footerH;
    
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#111214'; // Discord dark theme
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    for (let i = 0; i < activeObjectives.length; i++) {
      const obj = activeObjectives[i];
      const uo = progressMap.get(obj._id.toString());
      const progress = uo ? uo.progress : 0;
      const isCompleted = progress >= obj.targetValue;
      const isClaimed = uo ? uo.isClaimed : false;

      const col = i % columns;
      const rowNum = Math.floor(i / columns);
      
      const x = padding + (col * (cardWidth + gap));
      const y = padding + (rowNum * (cardHeight + gap));

      // Card Background
      ctx.fillStyle = '#1e1f22'; // Lighter card background
      ctx.beginPath();
      ctx.roundRect(x, y, cardWidth, cardHeight, 10);
      ctx.fill();

      // Mission Title
      const icon = getProgressIcon(progress, obj.targetValue, isClaimed);
      const statusSuffix = isClaimed ? ' ✅' : (isCompleted ? ' 🎁' : '');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(`${icon}  ${obj.name.toUpperCase()}${statusSuffix}`, x + 20, y + 35);

      // Description
      ctx.fillStyle = '#b5bac1';
      ctx.font = '16px sans-serif';
      ctx.fillText(obj.description, x + 20, y + 65);

      // Separator Line
      ctx.strokeStyle = '#313338';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 20, y + 85);
      ctx.lineTo(x + cardWidth - 20, y + 85);
      ctx.stroke();

      // Progress Bar
      const barX = x + 20;
      const barY = y + 105;
      const barWidth = 200;
      const barHeight = 15;
      
      // Empty Bar
      ctx.fillStyle = '#2b2d31';
      ctx.roundRect(barX, barY, barWidth, barHeight, 5);
      ctx.fill();

      // Filled Bar
      const fillRatio = Math.min(progress / obj.targetValue, 1);
      if (fillRatio > 0) {
        ctx.fillStyle = isClaimed ? '#23a559' : (isCompleted ? '#fcd53f' : '#5865F2');
        ctx.beginPath();
        ctx.roundRect(barX, barY, barWidth * fillRatio, barHeight, 5);
        ctx.fill();
      }

      // Progress Text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText(`${Math.min(progress, obj.targetValue)} / ${obj.targetValue}`, barX + barWidth + 15, barY + 13);

      // Reward Text
      const rewardText = obj.rewardType === 'coins' ? `🪙 ${obj.rewardValue.toLocaleString()}` : `🎒 Pack`;
      ctx.fillStyle = '#fcd53f';
      ctx.font = '18px sans-serif';
      ctx.fillText(rewardText, x + 20, y + 172);

      if (isCompleted && !isClaimed && row.components.length < 5) {
        hasClaimable = true;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_mission_${obj._id}`)
            .setLabel(`Claim ${obj.name}`)
            .setStyle(ButtonStyle.Success)
        );
      }
    }

    // Footer text inside canvas
    const footerY = canvasHeight - 14;
    ctx.fillStyle = '#72767d';
    ctx.font = '15px sans-serif';
    ctx.fillText(`${completedCount} / ${activeObjectives.length} completadas`, padding, footerY);
    if (hasClaimable) {
      ctx.fillStyle = '#23a559';
      ctx.fillText('· Pulsa el botón para reclamar', padding + 185, footerY);
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'missions.png' });

    embed.setImage('attachment://missions.png');

    const payload = { embeds: [embed], files: [attachment] };
    if (hasClaimable) {
      payload.components = [row];
    }

    await interaction.reply(payload);
    const message = await interaction.fetchReply();

    if (!hasClaimable) return;

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId && i.customId.startsWith('claim_mission_'),
      time: 60000
    });

    collector.on('collect', async i => {
      const objId = i.customId.replace('claim_mission_', '');

      const freshUser = await UserModel.findById(webUser._id);
      const uo = await UserObjectiveModel.findOne({ user_id: freshUser._id, objective_id: objId });
      const obj = activeObjectives.find(o => o._id.toString() === objId);

      if (!uo || uo.progress < obj.targetValue || uo.isClaimed) {
        return i.reply({ content: 'You cannot claim this reward.', flags: MessageFlags.Ephemeral });
      }

      // Grant reward
      if (obj.rewardType === 'coins') {
        freshUser.currency += obj.rewardValue;
        await freshUser.save();
      } else if (obj.rewardType === 'pack') {
        let userPack = await UserPackModel.findOne({ user_id: freshUser._id, pack_id: obj.rewardValue });
        if (userPack) {
          userPack.quantity += 1;
          await userPack.save();
        } else {
          await UserPackModel.create({
            user_id: freshUser._id,
            pack_id: obj.rewardValue,
            quantity: 1
          });
        }
      }

      uo.isClaimed = true;
      await uo.save();

      await i.reply({ content: `🎉 You claimed the reward for **${obj.name}**!`, flags: MessageFlags.Ephemeral });

      // Update buttons
      row.components.forEach(c => {
        if (c.data.custom_id === i.customId) {
          c.setDisabled(true);
        }
      });
      await interaction.editReply({ components: [row] });
    });

  } catch (error) {
    console.error('Error in /missions command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
