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

    // ─── Blue Lock Project Canvas ─────────────────────────────────────────────
    const CW = 1020;
    const HEADER_H = 128;
    const PROGRESS_H = 80;
    const PAD = 16;
    const CARD_GAP = 12;
    const numRows = Math.ceil(activeObjectives.length / 2);
    const CARD_H = 188;
    const FOOTER_H = 54;
    const CARD_AREA_Y = HEADER_H + PROGRESS_H + 8;
    const CARD_W = (CW - PAD * 2 - CARD_GAP) / 2;
    const CH = CARD_AREA_Y + numRows * CARD_H + (numRows - 1) * CARD_GAP + 8 + FOOTER_H;

    const canvas = createCanvas(CW, CH);
    const ctx = canvas.getContext('2d');

    // helper: draw pentagon
    function pentagon(x, y, r) {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI / 5) - Math.PI / 2;
        k === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
                : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      }
      ctx.closePath();
    }

    // ── BACKGROUND ──────────────────────────────────────────────────────────────
    const bgG = ctx.createLinearGradient(0, 0, CW, CH);
    bgG.addColorStop(0, '#040918');
    bgG.addColorStop(1, '#08102a');
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, CW, CH);

    // ── HEADER ──────────────────────────────────────────────────────────────────
    // Diagonal streaks
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CW, HEADER_H);
    ctx.clip();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#3366ff';
    ctx.lineWidth = 28;
    for (let sx = -200; sx < CW + 400; sx += 56) {
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 180, HEADER_H); ctx.stroke();
    }
    ctx.restore();

    // Top blue bar
    ctx.fillStyle = '#1a4fff';
    ctx.fillRect(0, 0, CW, 4);

    // Pentagon logo
    pentagon(54, 62, 40);
    ctx.fillStyle = '#1a4fff'; ctx.fill();
    pentagon(54, 62, 22);
    ctx.fillStyle = '#040918'; ctx.fill();
    pentagon(54, 62, 11);
    ctx.fillStyle = '#1a4fff'; ctx.fill();

    // "BLUE LOCK PROJECT" small label
    ctx.fillStyle = '#4a8aff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('BLUE LOCK PROJECT', 106, 38);

    // "MISIONES" large italic
    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic bold 64px sans-serif';
    ctx.fillText('MISIONES', 104, 102);

    // Japanese subtitle
    ctx.fillStyle = '#3a6aff';
    ctx.font = '13px sans-serif';
    ctx.fillText('\u30df\u30c3\u30b7\u30e7\u30f3\u3092\u30af\u30ea\u30a2\u3057\u3066\u5831\u9149\u3092\u7372\u5f97\u3057\u3088\u3046', PAD, HEADER_H - 10);

    // Header bottom divider (gradient)
    const hDivG = ctx.createLinearGradient(0, 0, CW, 0);
    hDivG.addColorStop(0, '#1a4fff'); hDivG.addColorStop(0.6, '#1a3a7a'); hDivG.addColorStop(1, 'transparent');
    ctx.strokeStyle = hDivG; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, HEADER_H); ctx.lineTo(CW, HEADER_H); ctx.stroke();

    // ── PROGRESS TRACKER ────────────────────────────────────────────────────────
    const PY = HEADER_H;

    ctx.fillStyle = '#0b1530';
    ctx.fillRect(0, PY, CW * 0.56, PROGRESS_H);
    ctx.fillStyle = '#09112a';
    ctx.fillRect(CW * 0.56, PY, CW * 0.44, PROGRESS_H);

    ctx.strokeStyle = '#162040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, PY + PROGRESS_H); ctx.lineTo(CW, PY + PROGRESS_H); ctx.stroke();

    // "PROGRESO DIARIO" label
    ctx.fillStyle = '#4a7aff'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('PROGRESO DIARIO', PAD + 8, PY + 20);

    // "1/4  COMPLETADAS"
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px sans-serif';
    ctx.fillText(`${completedCount}`, PAD + 8, PY + 65);

    const cntW = ctx.measureText(`${completedCount}`).width;
    ctx.fillStyle = '#3a6aff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText(`/${activeObjectives.length}`, PAD + 8 + cntW + 2, PY + 65);

    ctx.fillStyle = '#6a80aa'; ctx.font = 'bold 11px sans-serif';
    ctx.fillText('COMPLETADAS', PAD + 8 + cntW + 2 + ctx.measureText(`/${activeObjectives.length}`).width + 8, PY + 65);

    // Numbered step track
    const TRX0 = 210, TRX1 = CW * 0.52, TRY = PY + PROGRESS_H / 2;
    ctx.strokeStyle = '#1a3060'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(TRX0, TRY); ctx.lineTo(TRX1, TRY); ctx.stroke();

    if (completedCount > 0) {
      const fillEnd = TRX0 + (Math.min(completedCount, activeObjectives.length) / activeObjectives.length) * (TRX1 - TRX0);
      ctx.strokeStyle = '#1a4fff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(TRX0, TRY); ctx.lineTo(fillEnd, TRY); ctx.stroke();
    }

    for (let s = 0; s < activeObjectives.length; s++) {
      const sx = TRX0 + (s / Math.max(activeObjectives.length - 1, 1)) * (TRX1 - TRX0);
      const done = s < completedCount, active = s === completedCount;
      ctx.beginPath(); ctx.arc(sx, TRY, active ? 10 : 7, 0, Math.PI * 2);
      ctx.fillStyle = done ? '#1a4fff' : active ? '#ffffff' : '#162040'; ctx.fill();
      if (active) { ctx.strokeStyle = '#1a4fff'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.fillStyle = done ? '#ffffff' : active ? '#1a4fff' : '#3a5070';
      ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(s + 1, sx, TRY + 4); ctx.textAlign = 'left';
    }

    // Right: RECOMPENSA FINAL
    ctx.fillStyle = '#4a7aff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('RECOMPENSA FINAL', CW - PAD - 8, PY + 22);
    ctx.fillStyle = '#ffffff'; ctx.font = 'italic bold 22px sans-serif';
    ctx.fillText('MEGA PACK', CW - PAD - 8, PY + 58);
    ctx.textAlign = 'left';

    // Vertical divider in progress bar
    ctx.strokeStyle = '#1a3060'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(CW * 0.56), PY); ctx.lineTo(Math.round(CW * 0.56), PY + PROGRESS_H); ctx.stroke();

    // ── MISSION CARDS ───────────────────────────────────────────────────────────
    for (let i = 0; i < activeObjectives.length; i++) {
      const obj = activeObjectives[i];
      const uo = progressMap.get(obj._id.toString());
      const progress = uo ? uo.progress : 0;
      const isCompleted = progress >= obj.targetValue;
      const isClaimed = uo ? uo.isClaimed : false;

      const col = i % 2;
      const rowNum = Math.floor(i / 2);
      const cx = PAD + col * (CARD_W + CARD_GAP);
      const cy = CARD_AREA_Y + rowNum * (CARD_H + CARD_GAP);

      const accent = isClaimed ? '#22c55e' : isCompleted ? '#22c55e' : '#1a4fff';
      const borderCol = isClaimed ? '#22c55e' : isCompleted ? '#22c55e' : '#1a3a7a';

      // Card bg
      ctx.fillStyle = '#0a1326';
      ctx.beginPath(); ctx.roundRect(cx, cy, CARD_W, CARD_H, 4); ctx.fill();

      // Card border
      ctx.strokeStyle = borderCol; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(cx, cy, CARD_W, CARD_H, 4); ctx.stroke();

      // ── Left number panel ──
      const LNUM_W = 90;
      ctx.fillStyle = '#060e20';
      ctx.save();
      ctx.beginPath(); ctx.roundRect(cx, cy, LNUM_W, CARD_H, [4, 0, 0, 4]); ctx.clip();
      ctx.fillRect(cx, cy, LNUM_W, CARD_H);
      // diagonal stripes
      ctx.globalAlpha = 0.12; ctx.strokeStyle = accent; ctx.lineWidth = 12;
      for (let ds = cx - 40; ds < cx + LNUM_W + 40; ds += 20) {
        ctx.beginPath(); ctx.moveTo(ds, cy); ctx.lineTo(ds + 50, cy + CARD_H); ctx.stroke();
      }
      ctx.restore();

      // Divider between left and right
      ctx.strokeStyle = borderCol; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx + LNUM_W, cy); ctx.lineTo(cx + LNUM_W, cy + CARD_H); ctx.stroke();

      // Mission number
      ctx.fillStyle = accent; ctx.font = 'italic bold 42px sans-serif';
      ctx.fillText(String(i + 1).padStart(2, '0'), cx + 8, cy + 56);

      // "MISION" label
      ctx.fillStyle = accent; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('MISI\u00d3N', cx + 8, cy + 74);

      // ── Right content ──
      const RX = cx + LNUM_W + 14;
      const RW = CARD_W - LNUM_W - 20;

      // Mission name
      ctx.fillStyle = '#ffffff'; ctx.font = 'italic bold 18px sans-serif';
      ctx.fillText(obj.name.toUpperCase(), RX, cy + 26);

      // COMPLETADA tag
      if (isCompleted) {
        ctx.fillStyle = '#22c55e'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText('\u2713 COMPLETADA', cx + CARD_W - 10, cy + 26);
        ctx.textAlign = 'left';
      }

      // Description
      ctx.fillStyle = '#7a90b0'; ctx.font = '13px sans-serif';
      ctx.fillText(obj.description, RX, cy + 48);

      // Progress bar
      const BX = RX, BY = cy + 62, BW = RW, BH = 8;
      ctx.fillStyle = '#112040';
      ctx.beginPath(); ctx.roundRect(BX, BY, BW, BH, 4); ctx.fill();

      const ratio = Math.min(progress / obj.targetValue, 1);
      if (ratio > 0) {
        const bG = ctx.createLinearGradient(BX, 0, BX + BW, 0);
        if (isCompleted || isClaimed) { bG.addColorStop(0, '#16a34a'); bG.addColorStop(1, '#22c55e'); }
        else { bG.addColorStop(0, '#1a4fff'); bG.addColorStop(1, '#5a9aff'); }
        ctx.fillStyle = bG;
        ctx.beginPath(); ctx.roundRect(BX, BY, BW * ratio, BH, 4); ctx.fill();
      }

      // Progress fraction
      ctx.fillStyle = '#c8d8f0'; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(`${Math.min(progress, obj.targetValue)}/${obj.targetValue}`, cx + CARD_W - 10, cy + 90);
      ctx.textAlign = 'left';

      // "RECOMPENSA" label
      ctx.fillStyle = accent; ctx.font = 'bold 10px sans-serif';
      ctx.fillText('RECOMPENSA', RX, cy + 112);

      // Reward icon circle
      const iconColor = obj.rewardType === 'coins' ? '#b8860b' : '#7a4fff';
      ctx.fillStyle = iconColor;
      ctx.beginPath(); ctx.arc(RX + 11, cy + 136, 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(RX + 11, cy + 136, 11, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(obj.rewardType === 'coins' ? 'UT' : '+', RX + 11, cy + 140);
      ctx.textAlign = 'left';

      // Reward text
      const rewardLabel = obj.rewardType === 'coins'
        ? `${obj.rewardValue.toLocaleString()} COINS`
        : `1 PREMIUM PACK`;
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px sans-serif';
      ctx.fillText(rewardLabel, RX + 28, cy + 142);

      // Buttons for claiming
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
    const FY = CH - FOOTER_H;
    ctx.fillStyle = '#050c1c';
    ctx.fillRect(0, FY, CW, FOOTER_H);
    ctx.strokeStyle = '#162040'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, FY); ctx.lineTo(CW, FY); ctx.stroke();

    // Clock icon
    ctx.strokeStyle = '#3a6aff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(PAD + 14, FY + FOOTER_H / 2, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(PAD + 14, FY + FOOTER_H / 2); ctx.lineTo(PAD + 14, FY + FOOTER_H / 2 - 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(PAD + 14, FY + FOOTER_H / 2); ctx.lineTo(PAD + 14 + 5, FY + FOOTER_H / 2 + 3); ctx.stroke();

    // Reset label + time
    ctx.fillStyle = '#3a6aff'; ctx.font = 'bold 10px sans-serif';
    ctx.fillText('REINICIO DIARIO', PAD + 32, FY + 17);
    const now2 = new Date();
    const mdn = new Date(now2); mdn.setHours(24, 0, 0, 0);
    const msL = mdn - now2;
    const hL = Math.floor(msL / 3600000), mL = Math.floor((msL % 3600000) / 60000);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${hL}h ${mL}m`, PAD + 32, FY + 38);

    // Center text
    ctx.fillStyle = '#3a5070'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Las misiones se reinician todos los d\u00edas.', CW / 2, FY + FOOTER_H / 2 + 5);
    ctx.textAlign = 'left';

    // Right tag
    ctx.fillStyle = '#3a6aff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('// BLUE LOCK PROJECT', CW - PAD, FY + FOOTER_H / 2 + 5);
    ctx.textAlign = 'left';

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
