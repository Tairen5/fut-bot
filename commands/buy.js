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
import PlayerModel from '../schemas/playerSchema.js';

// ─── Constantes ────────────────────────────────────────────────────────────────

const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';
const COLLECTOR_TIMEOUT = 60_000; // 60 segundos

// Precio dinámico calculado según el overall del jugador
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

/** Devuelve el precio de un jugador en función de su overall. */
function getPlayerPrice(overall) {
  return (PRICE_TABLE.find(t => overall >= t.min) ?? PRICE_TABLE.at(-1)).price;
}

/** Devuelve un objeto { embedUrl, files } para adjuntar la imagen al embed. */
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

/** Color del embed según el overall (igual que en claim y en la web). */
function getEmbedColor(overall) {
  if (overall >= 95) return 0xffd700;
  if (overall >= 90) return 0xc9a752;
  if (overall >= 85) return 0x22c55e;
  if (overall >= 80) return 0x4f8ef7;
  return 0x888888;
}

/** Crea el embed de presentación del jugador seleccionado. */
function buildPlayerEmbed(player, index, total) {
  const price = getPlayerPrice(player.overall);
  const s = player.stats || {};

  const allPositions = [player.position, ...(player.secondaryPositions ?? [])].filter(Boolean);
  const positionsStr = allPositions.map(p => `\`${p}\``).join('  ');

  const { embedUrl, files } = getPlayerImageAttachment(player.image);

  const embed = new EmbedBuilder()
    .setColor(0xaa1c5f)
    .setTitle(`Please select the card you're looking for:`)
    .setDescription(
      `${positionsStr ? `**${positionsStr}**  ·  ` : ''}⭐ **${player.overall}**\n` +
      `${player.club?.name || ''}${player.nation?.name ? `  ·  ${player.nation.name}` : ''}\n\n` +
      `\`PAC ${s.pac ?? '—'}\`  \`SHO ${s.sho ?? '—'}\`  \`PAS ${s.pas ?? '—'}\`  \`DRI ${s.dri ?? '—'}\`  \`DEF ${s.def ?? '—'}\`  \`PHY ${s.phy ?? '—'}\`\n\n` +
      `💰 Price: **${price.toLocaleString()} coins**`
    )
    .setImage(embedUrl)
    .setFooter({ text: `Card ${index + 1} of ${total} • Responses collected for 1 minute` });

  return { embed, files };
}

/** Construye la fila de botones de navegación + confirmar. */
function buildActionRow(index, total) {
  const hasPrev = index > 0;
  const hasNext = index < total - 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀ Prev')
      .setStyle(hasPrev ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!hasPrev),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next ▶')
      .setStyle(hasNext ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(!hasNext),
    new ButtonBuilder()
      .setCustomId('buy_confirm')
      .setLabel('✅ Buy')
      .setStyle(ButtonStyle.Success),
  );
}

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('buy')
  .setDescription('Buy a player for your club')
  .addStringOption(opt =>
    opt.setName('player')
      .setDescription('Player name to search for')
      .setRequired(true)
  );

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const discordId = interaction.user.id;
  const query = interaction.options.getString('player').trim();

  // 1. Buscar usuario web vinculado
  const webUser = await UserModel.findOne({ discordId });
  if (!webUser) {
    return interaction.reply({
      content: '❌ Your Discord account is not linked to the web yet. Log in at the website first.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // 2. Buscar jugadores en MongoDB (búsqueda insensible a mayúsculas)
  const matches = await PlayerModel.find({
    name: { $regex: new RegExp(`^${query}$`, 'i') }
  }).lean();

  if (matches.length === 0) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xaa1c5f)
          .setTitle('Player Not Found')
          .setDescription(`No player named **"${query}"** was found in the database.\nTry using the exact name shown on the web.`)
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  // 3. Mostrar el primer resultado con botones
  let currentIndex = 0;
  const { embed, files } = buildPlayerEmbed(matches[currentIndex], currentIndex, matches.length);
  const row = buildActionRow(currentIndex, matches.length);

  await interaction.reply({
    embeds: [embed],
    components: [row],
    files
  });
  const message = await interaction.fetchReply();

  // 4. Collector de botones (solo el usuario que ejecutó el comando)
  const collector = message.createMessageComponentCollector({
    filter: i => i.user.id === discordId,
    time: COLLECTOR_TIMEOUT,
  });

  collector.on('collect', async i => {
    // ── Navegación ──────────────────────────────────────────────────
    if (i.customId === 'prev' || i.customId === 'next') {
      currentIndex = i.customId === 'next'
        ? Math.min(currentIndex + 1, matches.length - 1)
        : Math.max(currentIndex - 1, 0);

      const { embed: updatedEmbed, files: updatedFiles } = buildPlayerEmbed(matches[currentIndex], currentIndex, matches.length);
      const updatedRow = buildActionRow(currentIndex, matches.length);

      await i.update({ embeds: [updatedEmbed], components: [updatedRow], files: updatedFiles });
      return;
    }

    // ── Confirmar compra ─────────────────────────────────────────────
    if (i.customId === 'buy_confirm') {
      collector.stop('confirmed');

      const player = matches[currentIndex];
      const price  = getPlayerPrice(player.overall);

      // Re-fetch el usuario para tener el balance más reciente
      const freshUser = await UserModel.findOne({ discordId });

      if (freshUser.currency < price) {
        await i.update({
          embeds: [
            new EmbedBuilder()
              .setColor(0xaa1c5f)
              .setTitle('Insufficient Funds')
              .setDescription(
                `You need **${price.toLocaleString()}** coins to buy **${player.name}**.\n` +
                `Your balance: **${freshUser.currency.toLocaleString()}** coins.`
              )
          ],
          components: [],
          files: [],
        });
        return;
      }

      // Descontar monedas y añadir jugador
      await UserModel.updateOne({ discordId }, { $inc: { currency: -price } });
      await UserPlayerModel.create({
        user_id:   freshUser._id,
        player_id: player._id,
        isTradeable: true,
      });

      const { embedUrl, files: successFiles } = getPlayerImageAttachment(player.image);
      await i.update({
        embeds: [
          new EmbedBuilder()
            .setColor(getEmbedColor(player.overall))
            .setTitle(`${player.name} has joined your club! 🎉`)
            .setDescription(
              `💰 **−${price.toLocaleString()} coins**\n` +
              `💳 New balance: **${(freshUser.currency - price).toLocaleString()} coins**`
            )
            .setImage(embedUrl)
            .setFooter({ text: 'Player added to your web collection' })
        ],
        components: [],
        files: successFiles,
      });
    }
  });

  // 5. Al expirar el collector, deshabilitar los botones
  collector.on('end', (_, reason) => {
    if (reason === 'confirmed') return;

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('prev').setLabel('◀ Prev').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('next').setLabel('Next ▶').setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId('buy_confirm').setLabel('Time Expired').setStyle(ButtonStyle.Secondary).setDisabled(true),
    );

    interaction.editReply({ components: [disabledRow] }).catch(() => {});
  });
}
