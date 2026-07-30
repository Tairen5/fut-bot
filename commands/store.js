import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} from 'discord.js';

import UserModel from '../schemas/userSchema.js';
import PackModel from '../schemas/packSchema.js';
import UserPackModel from '../schemas/userPackSchema.js';

const COLLECTOR_TIMEOUT = 60_000;

export const data = new SlashCommandBuilder()
  .setName('store')
  .setDescription('Open the store to buy packs for your club');

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

    const storePacks = await PackModel.find({ availableInStore: true }).lean();
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

    const storeEmbed = new EmbedBuilder()
      .setColor(0xaa1c5f)
      .setTitle('🛒 Pack Store')
      .setDescription(`Welcome to the store! Select a pack to buy.\nYour balance: **${webUser.currency.toLocaleString()} coins**\n*(Packs go to your /inventory)*\n\n`)
      .setThumbnail('https://imgur.com/ArczBYC.png');

    storePacks.forEach(pack => {
      storeEmbed.addFields({
        name: `${pack.name} — 🪙 ${pack.price.toLocaleString()} coins`,
        value: `Contains ${pack.numCards} ${pack.type === 'draft' ? 'choices (Player Pick)' : 'cards'}.`
      });
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('select_pack')
      .setPlaceholder('Choose a pack to buy...')
      .addOptions(
        storePacks.map(pack => ({
          label: pack.name,
          description: `🪙 ${pack.price.toLocaleString()} coins`,
          value: pack._id.toString()
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await interaction.reply({
      embeds: [storeEmbed],
      components: [row]
    });
    const message = await interaction.fetchReply();

    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      if (i.customId === 'select_pack') {
        const selectedPackId = i.values[0];
        const selectedPack = storePacks.find(p => p._id.toString() === selectedPackId);
        
        const freshUser = await UserModel.findOne({ discordId });

        if (freshUser.currency < selectedPack.price) {
          return i.reply({
            content: `You don't have enough coins! You need **${(selectedPack.price - freshUser.currency).toLocaleString()}** more coins.`,
            flags: MessageFlags.Ephemeral
          });
        }

        // Deduct balance
        freshUser.currency -= selectedPack.price;
        await freshUser.save();

        // Add to inventory
        let userPack = await UserPackModel.findOne({ user_id: freshUser._id, pack_id: selectedPack._id });
        if (userPack) {
          userPack.quantity += 1;
          await userPack.save();
        } else {
          await UserPackModel.create({
            user_id: freshUser._id,
            pack_id: selectedPack._id,
            quantity: 1
          });
        }

        // Update Store embed with new balance
        storeEmbed.setDescription(`✅ You bought a **${selectedPack.name}**!\nIt has been sent to your \`/inventory\`.\nYour balance: **${freshUser.currency.toLocaleString()} coins**\n\n`);
        
        await i.update({
          embeds: [storeEmbed],
          components: [row]
        });
      }
    });

    collector.on('end', () => {
      storeEmbed.setDescription('The store menu timed out. Run `/store` again to buy more packs.');
      interaction.editReply({ embeds: [storeEmbed], components: [] }).catch(() => {});
    });

  } catch (error) {
    console.error('Error in /store command:', error);
    if (!interaction.replied) {
      interaction.reply({ content: 'An internal error occurred.', flags: MessageFlags.Ephemeral });
    }
  }
}
