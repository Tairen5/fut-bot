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

    // ─── Blue Lock Canvas ────────────────────────────────────────────────────────
    const COLS = 2;
    const numRows = Math.ceil(activeObjectives.length / COLS);
    const CARD_W = 430;
    const CARD_H = 240;
    const GAP = 18;
    const PAD = 28;
    const HEADER_H = 72;
    const FOOTER_H = 38;

    const CW = PAD * 2 + CARD_W * COLS + GAP;
    const CH = HEADER_H + PAD + numRows * CARD_H + (numRows - 1) * GAP + PAD + FOOTER_H;

    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');

    // ── BG ──────────────────────────────────────────────────────────────────────
    ctx.fillStyle = '#07080f';
    ctx.fillRect(0, 0, CW, CH);

    // Subtle grid pattern
    ctx.strokeStyle = 'rgba(26,90,255,0.07)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < CW; gx += 40) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,CH); ctx.stroke(); }
    for (let gy = 0; gy < CH; gy += 40) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(CW,gy); ctx.stroke(); }

    // ── HEADER ──────────────────────────────────────────────────────────────────
    // Blue accent top bar
    ctx.fillStyle = '#1a5aff';
    ctx.fillRect(0, 0, CW, 4);

    // "MISIONES" bold
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('MISIONES', PAD, 48);

    // Accent tag "BLUE LOCK"
    ctx.fillStyle = '#1a5aff';
    ctx.beginPath();
    ctx.roundRect(PAD + 152, 28, 100, 26, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('BLUE LOCK', PAD + 162, 46);

    // Username right
    ctx.fillStyle = '#4c6ef5';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(interaction.user.username, CW - PAD, 48);
    ctx.textAlign = 'left';

    // Header divider
    const grad = ctx.createLinearGradient(0, 0, CW, 0);
    grad.addColorStop(0, '#1a5aff');
    grad.addColorStop(1, 'transparent');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_H - 2);
    ctx.lineTo(CW, HEADER_H - 2);
    ctx.stroke();

    // ── CARDS ───────────────────────────────────────────────────────────────────
    for (let i = 0; i < activeObjectives.length; i++) {
      const obj = activeObjectives[i];
      const uo = progressMap.get(obj._id.toString());
      const progress = uo ? uo.progress : 0;
      const isCompleted = progress >= obj.targetValue;
      const isClaimed = uo ? uo.isClaimed : false;

      const col = i % COLS;
      const rowNum = Math.floor(i / COLS);

      const cx = PAD + col * (CARD_W + GAP);
      const cy = HEADER_H + PAD + rowNum * (CARD_H + GAP);

      // Card background
      ctx.fillStyle = '#0d1220';
      ctx.beginPath();
      ctx.roundRect(cx, cy, CARD_W, CARD_H, 8);
      ctx.fill();

      // Card border
      ctx.strokeStyle = '#1a2540';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(cx, cy, CARD_W, CARD_H, 8);
      ctx.stroke();

      // Left accent bar colour: blue=active, gold=done, green=claimed, grey=empty
      const accentColor = isClaimed ? '#22c55e' : isCompleted ? '#f5c518' : progress > 0 ? '#1a5aff' : '#1a2540';
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.roundRect(cx, cy + 10, 4, CARD_H - 20, 2);
      ctx.fill();

      // Progress icon (unicode, not emoji)
      const icon = getProgressIcon(progress, obj.targetValue, isClaimed);
      const statusTag = isClaimed ? ' [DONE]' : isCompleted ? ' [CLAIM]' : '';

      // Mission name
      ctx.fillStyle = '#e8ecf4';
      ctx.font = 'bold 19px sans-serif';
      ctx.fillText(`${icon}  ${obj.name.toUpperCase()}${statusTag}`, cx + 18, cy + 36);

      // Description
      ctx.fillStyle = '#5a6a8a';
      ctx.font = '14px sans-serif';
      ctx.fillText(obj.description, cx + 18, cy + 62);

      // Thin separator
      ctx.strokeStyle = '#1a2540';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 18, cy + 78);
      ctx.lineTo(cx + CARD_W - 18, cy + 78);
      ctx.stroke();

      // Progress bar track
      const barX = cx + 18;
      const barY = cy + 100;
      const barW = CARD_W - 36;
      const barH = 10;

      ctx.fillStyle = '#111b30';
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW, barH, 5);
      ctx.fill();

      // Filled bar
      const ratio = Math.min(progress / obj.targetValue, 1);
      if (ratio > 0) {
        const barGrad = ctx.createLinearGradient(barX, 0, barX + barW * ratio, 0);
        if (isClaimed) { barGrad.addColorStop(0, '#16a34a'); barGrad.addColorStop(1, '#22c55e'); }
        else if (isCompleted) { barGrad.addColorStop(0, '#d97706'); barGrad.addColorStop(1, '#f5c518'); }
        else { barGrad.addColorStop(0, '#1a5aff'); barGrad.addColorStop(1, '#60a5fa'); }

        ctx.fillStyle = barGrad;
        ctx.beginPath();
        ctx.roundRect(barX, barY, barW * ratio, barH, 5);
        ctx.fill();
      }

      // Progress text
      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${Math.min(progress, obj.targetValue)} / ${obj.targetValue}`, barX, cy + 132);

      // Divider above reward
      ctx.strokeStyle = '#1a2540';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + 18, cy + 148);
      ctx.lineTo(cx + CARD_W - 18, cy + 148);
      ctx.stroke();

      // Reward line
      const rewardLabel = obj.rewardType === 'coins'
        ? `+ ${obj.rewardValue.toLocaleString()} COINS`
        : `+ 1 PACK`;
      ctx.fillStyle = obj.rewardType === 'coins' ? '#f5c518' : '#a78bfa';
      ctx.font = 'bold 15px sans-serif';
      ctx.fillText(rewardLabel, cx + 18, cy + 172);

      // Claim tag
      if (isCompleted && !isClaimed) {
        ctx.fillStyle = '#f5c518';
        ctx.beginPath();
        ctx.roundRect(cx + CARD_W - 110, cy + 156, 95, 26, 4);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText('RECLAMAR', cx + CARD_W - 97, cy + 174);
      }

      // Buttons
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

    // ── FOOTER ──────────────────────────────────────────────────────────────────
    const FY = CH - FOOTER_H / 2 + 6;
    ctx.fillStyle = '#2a3555';
    ctx.font = '13px sans-serif';
    ctx.fillText(`${completedCount} / ${activeObjectives.length} misiones completadas`, PAD, FY);

    if (hasClaimable) {
      ctx.fillStyle = '#22c55e';
      ctx.fillText('  ·  Pulsa el botón de abajo para reclamar', PAD + 220, FY);
    }

    // ── OUTPUT ──────────────────────────────────────────────────────────────────
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
