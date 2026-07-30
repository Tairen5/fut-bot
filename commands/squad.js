import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} from 'discord.js';

import UserModel from '../schemas/userSchema.js';
import UserPlayerModel from '../schemas/userPlayerSchema.js';

// ─── Constantes ────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;
const COLLECTOR_TIMEOUT = 60_000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Genera la tabla de jugadores para la página actual como bloque de código. */
function buildTablePage(players, page) {
  const start = page * ITEMS_PER_PAGE;
  const slice = players.slice(start, start + ITEMS_PER_PAGE);

  const header = '#    Name                 OVR  POS\n' + '─'.repeat(36) + '\n';

  const rows = slice.map((entry, i) => {
    const p = entry.player_id;
    const num  = (start + i + 1).toString().padEnd(5);
    const name = (p.name ?? '—').substring(0, 20).padEnd(21);
    const ovr  = (p.overall?.toString() ?? '—').padEnd(5);
    const pos  = p.position ?? '—';
    return `${num}${name}${ovr}${pos}`;
  });

  return '```\n' + header + rows.join('\n') + '\n```';
}

/** Construye el embed para una página concreta. */
function buildEmbed(players, page) {
  const total = players.length;
  const totalPages = Math.ceil(total / ITEMS_PER_PAGE);

  return new EmbedBuilder()
    .setColor(0xaa1c5f)
    .setTitle('📋 Your Squad')
    .setDescription(buildTablePage(players, page))
    .setFooter({ text: `Page ${page + 1} of ${totalPages}  •  ${total} players total` });
}

/** Construye la fila de botones de navegación. */
function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('prev')
      .setLabel('◀ Prev')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId('next')
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages - 1),
  );
}

// ─── Command definition ────────────────────────────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName('squad')
  .setDescription('Show all the players in your collection');

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  const discordId = interaction.user.id;

  try {
    // 1. Buscar usuario vinculado
    const webUser = await UserModel.findOne({ discordId });
    if (!webUser) {
      return interaction.reply({
        content: '❌ Your Discord account is not linked to the web yet. Log in at the website first.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // 2. Obtener todos los jugadores del usuario (con datos del jugador)
    const userPlayers = await UserPlayerModel.find({ user_id: webUser._id })
      .populate('player_id', 'name overall position')
      .lean();

    if (!userPlayers.length) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xaa1c5f)
            .setTitle('📋 Your Squad')
            .setDescription('You have no players yet. Use `/claim` to get your first one!')
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    // 3. Ordenar por overall descendente
    userPlayers.sort((a, b) => (b.player_id?.overall ?? 0) - (a.player_id?.overall ?? 0));

    const totalPages = Math.ceil(userPlayers.length / ITEMS_PER_PAGE);
    let currentPage = 0;

    // 4. Responder con la primera página
    const message = await interaction.reply({
      embeds: [buildEmbed(userPlayers, currentPage)],
      components: totalPages > 1 ? [buildRow(currentPage, totalPages)] : [],
      withResponse: true,
    });

    if (totalPages <= 1) return; // sin paginación si cabe en una página

    // 5. Collector de botones de navegación
    const collector = message.createMessageComponentCollector({
      filter: i => i.user.id === discordId,
      time: COLLECTOR_TIMEOUT,
    });

    collector.on('collect', async i => {
      currentPage = i.customId === 'next'
        ? Math.min(currentPage + 1, totalPages - 1)
        : Math.max(currentPage - 1, 0);

      await i.update({
        embeds: [buildEmbed(userPlayers, currentPage)],
        components: [buildRow(currentPage, totalPages)],
      });
    });

    collector.on('end', () => {
      const disabledRow = buildRow(currentPage, totalPages);
      disabledRow.components.forEach(c => c.setDisabled(true));
      interaction.editReply({ components: [disabledRow] }).catch(() => {});
    });

  } catch (error) {
    console.error('Error executing /squad:', error);
    await interaction.reply({
      content: 'An internal error occurred. Please try again later.',
      flags: MessageFlags.Ephemeral,
    });
  }
}
