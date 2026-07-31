import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';

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

    // Parse missions into Discord embed fields
    const fields = [];
    for (const obj of activeObjectives) {
      const uo = progressMap.get(obj._id.toString());
      const progress = uo ? uo.progress : 0;
      const isCompleted = progress >= obj.targetValue;
      const isClaimed = uo ? uo.isClaimed : false;

      const icon = typeIcons[obj.type] ?? '◈';
      const rewardText = obj.rewardType === 'coins' ? `🪙 ${obj.rewardValue.toLocaleString()}` : `🎒 Pack`;

      const barLen = 10;
      const filledBlocks = Math.round(Math.min(progress / obj.targetValue, 1) * barLen);
      const bar = '█'.repeat(filledBlocks) + '░'.repeat(barLen - filledBlocks);

      const statusSuffix = isClaimed ? ' ✅' : (isCompleted ? ' 🎁' : '');
      const progressText = `${progress} / ${obj.targetValue}`;

      fields.push({
        name: `${icon}  ${obj.name.toUpperCase()}${statusSuffix}`,
        value: `${obj.description}\n\n${bar} **${progressText}**\n${rewardText}`,
        inline: true,
        id: obj._id.toString(),
        objName: obj.name,
        isClaimable: isCompleted && !isClaimed
      });
    }

    // Add empty spacer fields to force 2-column layout (Discord allows max 3 inline per row)
    const spacedFields = [];
    for (let i = 0; i < fields.length; i++) {
      spacedFields.push({ name: fields[i].name, value: fields[i].value, inline: true });
      if ((i + 1) % 2 === 0 && i + 1 < fields.length) {
        spacedFields.push({ name: '\u200b', value: '\u200b', inline: false });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x0e50e6)
      .setDescription(`**⚽ Misiones Diarias**\n\n🏆 Completa todas las misiones para ser el mejor egoísta.\n\n`)
      .addFields(spacedFields);

    const row = new ActionRowBuilder();
    let hasClaimable = false;

    for (const field of fields) {
      if (field.isClaimable && row.components.length < 5) {
        hasClaimable = true;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_mission_${field.id}`)
            .setLabel(`Reclamar ${field.objName}`)
            .setStyle(ButtonStyle.Success)
        );
      }
    }

    const payload = { embeds: [embed] };
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
