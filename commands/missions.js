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

    // Function to calculate visual length for monospace alignment
    function visualPad(str, length) {
      let visualLength = 0;
      const segments = [...str];
      for (const char of segments) {
        const code = char.codePointAt(0);
        // Emojis and most symbols render as 2 spaces wide in Discord codeblocks
        if (code > 0xFFFF || (code >= 0x2600 && code <= 0x27BF)) {
          visualLength += 2;
        } else {
          visualLength += 1;
        }
      }
      const paddingNeeded = Math.max(0, length - visualLength);
      return str + ' '.repeat(paddingNeeded);
    }

    const typeIcons = {
      OPEN_PACKS: '📦',
      SELL_PLAYERS: '💰',
      BUY_PACKS: '🛒'
    };

    let completedCount = 0;
    const items = [];

    // Parse missions
    for (const obj of activeObjectives) {
      const uo = progressMap.get(obj._id.toString());
      const progress = uo ? uo.progress : 0;
      const isCompleted = progress >= obj.targetValue;
      const isClaimed = uo ? uo.isClaimed : false;

      if (isCompleted) completedCount++;

      const icon = typeIcons[obj.type] ?? '◈';
      const rewardText = obj.rewardType === 'coins' ? `🪙 ${obj.rewardValue.toLocaleString()}` : `🎒 Pack`;

      const barLen = 10;
      const filledBlocks = Math.round(Math.min(progress / obj.targetValue, 1) * barLen);
      const bar = '█'.repeat(filledBlocks) + '░'.repeat(barLen - filledBlocks);

      const statusSuffix = isClaimed ? ' ✅' : (isCompleted ? ' 🎁' : '');

      items.push({
        title: `${icon} ${obj.name.toUpperCase()}${statusSuffix}`,
        reward: rewardText,
        desc: obj.description,
        progress: `${bar} ${progress}/${obj.targetValue}`,
        id: obj._id.toString(),
        name: obj.name,
        isClaimable: isCompleted && !isClaimed
      });
    }

    // Build ASCII Grid
    const colWidth = 26;
    let grid = '┌' + '─'.repeat(colWidth) + '┬' + '─'.repeat(colWidth) + '┐\n';

    for (let i = 0; i < items.length; i += 2) {
      const left = items[i];
      const right = items[i + 1]; // might be undefined

      const formatLine = (valL, valR) => {
        const pL = visualPad(` ${valL}`, colWidth);
        const pR = right ? visualPad(` ${valR}`, colWidth) : visualPad('', colWidth);
        return `│${pL}│${pR}│\n`;
      };

      grid += formatLine(left.title, right ? right.title : '');
      grid += formatLine(left.reward, right ? right.reward : '');
      grid += formatLine(left.desc, right ? right.desc : '');
      grid += formatLine(left.progress, right ? right.progress : '');

      if (i + 2 < items.length) {
        grid += '├' + '─'.repeat(colWidth) + '┼' + '─'.repeat(colWidth) + '┤\n';
      } else {
        grid += '└' + '─'.repeat(colWidth) + '┴' + '─'.repeat(colWidth) + '┘';
      }
    }

    const overallPct = Math.round((completedCount / activeObjectives.length) * 100) || 0;
    const overallFilled = Math.round((completedCount / activeObjectives.length) * 10) || 0;
    const overallBar = '█'.repeat(overallFilled) + '░'.repeat(10 - overallFilled);

    const embed = new EmbedBuilder()
      .setColor(0x0e50e6)
      .setDescription(`**⚽ Misiones Diarias**\n\n**Progreso Total**\n\`${overallBar} ${overallPct}% (${completedCount}/${activeObjectives.length})\`\n\n\`\`\`text\n${grid}\n\`\`\`\n🏆 Completa todas las misiones para ser el mejor egoísta.`);

    const row = new ActionRowBuilder();
    let hasClaimable = false;

    for (const item of items) {
      if (item.isClaimable && row.components.length < 5) {
        hasClaimable = true;
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_mission_${item.id}`)
            .setLabel(`Reclamar ${item.name}`)
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
