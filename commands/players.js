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
import PlayerModel from '../schemas/playerSchema.js';

// Cuántos jugadores por página
const PAGE_SIZE = 1;

// Ruta local de las cartas (carpeta pública del frontend)
const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';

// Devuelve un adjunto local o URL remota para la imagen del jugador
function getPlayerImageAttachment(imageName) {
  if (!imageName) return { embedUrl: null, files: [] };
  if (imageName.startsWith('http')) return { embedUrl: imageName, files: [] };

  const localFilePath = path.join(CARDS_LOCAL_PATH, imageName);
  if (fs.existsSync(localFilePath)) {
    const attachment = new AttachmentBuilder(localFilePath, { name: imageName });
    return { embedUrl: `attachment://${imageName}`, files: [attachment] };
  }

  const baseUrl = process.env.ASSETS_BASE_URL || 'http://localhost:5173';
  return { embedUrl: `${baseUrl}/player-cards/${imageName}`, files: [] };
}

// Construye el color del embed basado en la media
function getRatingColor(overall) {
  if (overall >= 95) return 0xffd700; // Oro brillante — iconos
  if (overall >= 90) return 0xc9a752; // Oro
  if (overall >= 85) return 0x22c55e; // Verde
  if (overall >= 80) return 0x4f8ef7; // Azul
  return 0x888888;                    // Gris
}

// Genera el embed de un jugador
function buildPlayerEmbed(player, currentPage, totalPages) {
  const stats = player.stats || {};
  const color = getRatingColor(player.overall);
  const promo = player.promo ? `\`${player.promo}\`` : '`Standard`';

  const embed = new EmbedBuilder()
    .setTitle(`${player.name}`)
    .addFields(
      { name: 'Overall', value: `⭐ **${player.overall}**`, inline: true },
      { name: 'Position', value: `\`${player.position}\``, inline: true },
      { name: 'Promo', value: promo, inline: true },
      { name: 'PAC', value: `\`${stats.pac ?? '—'}\``, inline: true },
      { name: 'SHO', value: `\`${stats.sho ?? '—'}\``, inline: true },
      { name: 'PAS', value: `\`${stats.pas ?? '—'}\``, inline: true },
      { name: 'DRI', value: `\`${stats.dri ?? '—'}\``, inline: true },
      { name: 'DEF', value: `\`${stats.def ?? '—'}\``, inline: true },
      { name: 'PHY', value: `\`${stats.phy ?? '—'}\``, inline: true },
      { name: 'Club', value: player.club?.name || 'Unknown', inline: true },
      { name: 'Nation', value: player.nation?.name || 'Unknown', inline: true },
    )
    .setColor(color)
    .setFooter({ text: `Player ${currentPage} of ${totalPages}` });

  return embed;
}

export const data = new SlashCommandBuilder()
  .setName('players')
  .setDescription('Browse all players in the database')
  .addStringOption(option =>
    option
      .setName('search')
      .setDescription('Filter by player name')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('position')
      .setDescription('Filter by position (e.g. ST, CB, GK...)')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    // Leer opciones del comando
    const searchQuery = interaction.options.getString('search') || '';
    const positionQuery = interaction.options.getString('position') || '';

    // Construir filtro para MongoDB
    const mongoQuery = {};
    if (searchQuery) mongoQuery.name = { $regex: searchQuery, $options: 'i' };
    if (positionQuery) mongoQuery.$or = [
      { position: { $regex: positionQuery, $options: 'i' } },
      { secondaryPositions: { $regex: positionQuery, $options: 'i' } }
    ];

    // Obtener jugadores de la base de datos ordenados por media descendente
    const allPlayers = await PlayerModel.find(mongoQuery).sort({ overall: -1 });

    if (!allPlayers || allPlayers.length === 0) {
      return interaction.editReply({ content: `❌ No players found${searchQuery ? ` matching \`${searchQuery}\`` : ''}.` });
    }

    const totalPages = allPlayers.length;
    let currentPage = 1;

    // Función para enviar la página actual
    const renderPage = async (page) => {
      const player = allPlayers[page - 1];
      const embed = buildPlayerEmbed(player, page, totalPages);
      const { embedUrl, files } = getPlayerImageAttachment(player.image);

      if (embedUrl) embed.setImage(embedUrl);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('players_first')
          .setLabel('⏮')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 1),
        new ButtonBuilder()
          .setCustomId('players_prev')
          .setLabel('◀ Prev')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 1),
        new ButtonBuilder()
          .setCustomId('players_next')
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages),
        new ButtonBuilder()
          .setCustomId('players_last')
          .setLabel('⏭')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages),
      );

      return { embeds: [embed], components: [row], files };
    };

    // Enviar primera página
    const initialPayload = await renderPage(currentPage);
    const message = await interaction.editReply({ ...initialPayload, fetchReply: true });

    // Colector de botones — escucha solo al usuario que ejecutó el comando
    const filter = i => i.user.id === interaction.user.id && ['players_first', 'players_prev', 'players_next', 'players_last'].includes(i.customId);
    const collector = message.createMessageComponentCollector({ filter, time: 120000 }); // 2 minutos

    collector.on('collect', async i => {
      await i.deferUpdate();

      if (i.customId === 'players_first') currentPage = 1;
      else if (i.customId === 'players_prev') currentPage = Math.max(1, currentPage - 1);
      else if (i.customId === 'players_next') currentPage = Math.min(totalPages, currentPage + 1);
      else if (i.customId === 'players_last') currentPage = totalPages;

      const newPayload = await renderPage(currentPage);
      await interaction.editReply(newPayload);
    });

    // Al expirar el tiempo, desactivar los botones
    collector.on('end', async () => {
      const player = allPlayers[currentPage - 1];
      const embed = buildPlayerEmbed(player, currentPage, totalPages);
      const { embedUrl, files } = getPlayerImageAttachment(player.image);
      if (embedUrl) embed.setImage(embedUrl);

      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('players_first').setLabel('⏮').setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId('players_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('players_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId('players_last').setLabel('⏭').setStyle(ButtonStyle.Secondary).setDisabled(true),
      );

      await interaction.editReply({ embeds: [embed], components: [disabledRow], files }).catch(console.error);
    });

  } catch (error) {
    console.error('Error executing /players command:', error);
    await interaction.editReply({ content: 'An internal error occurred while loading players.' });
  }
}
