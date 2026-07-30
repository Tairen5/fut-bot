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

// Modelos compartidos con la web (misma base de datos MongoDB)
import UserModel from '../schemas/userSchema.js';
import UserPlayerModel from '../schemas/userPlayerSchema.js';
import PlayerModel from '../schemas/playerSchema.js';

// Mapa para gestionar los cooldowns por usuario
const cooldowns = new Map();
const COOLDOWN_DURATION = 15 * 60 * 1000; // 15 minutos

// Ruta local de las imágenes de cartas (carpeta pública del frontend de la web)
const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';

// Construye la URL del avatar de Discord para el embed
function getPlayerImageAttachment(imageName) {
  if (!imageName) return { embedUrl: 'https://i.imgur.com/8m4Y4zX.png', files: [] };
  if (imageName.startsWith('http')) return { embedUrl: imageName, files: [] };

  const localFilePath = path.join(CARDS_LOCAL_PATH, imageName);
  if (fs.existsSync(localFilePath)) {
    const attachment = new AttachmentBuilder(localFilePath, { name: imageName });
    return { embedUrl: `attachment://${imageName}`, files: [attachment] };
  }

  // Fallback a URL remota si el archivo no existe localmente
  const baseUrl = process.env.ASSETS_BASE_URL || 'http://localhost:5173';
  return { embedUrl: `${baseUrl}/player-cards/${imageName}`, files: [] };
}

export const data = new SlashCommandBuilder()
  .setName('claim')
  .setDescription('Get a new player for your club from the database');

export async function execute(interaction) {
  const discordId = interaction.user.id;

  // 1. Verificación del Cooldown
  if (cooldowns.has(discordId)) {
    const cooldownEnd = cooldowns.get(discordId);
    const remaining = cooldownEnd - Date.now();

    if (remaining > 0) {
      const h = Math.floor((remaining / (1000 * 60 * 60)) % 24).toString().padStart(2, '0');
      const m = Math.floor((remaining / (1000 * 60)) % 60).toString().padStart(2, '0');
      const s = Math.floor((remaining / 1000) % 60).toString().padStart(2, '0');

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('You are on cooldown!')
            .setDescription(`You can use this command again in: **${h}:${m}:${s}**`)
            .setColor(0xaa1c5f)
        ],
        flags: MessageFlags.Ephemeral
      });
    }
  }

  try {
    // 2. Buscar al usuario en MongoDB por su discordId (misma colección que la web)
    const webUser = await UserModel.findOne({ discordId });

    if (!webUser) {
      return interaction.reply({
        content: '❌ Your Discord account is not linked to the web yet. Please log in at the web first so your accounts are connected.',
        flags: MessageFlags.Ephemeral
      });
    }

    // 3. Obtener todos los jugadores de la base de datos real
    const allPlayers = await PlayerModel.find({});

    if (!allPlayers || allPlayers.length === 0) {
      return interaction.reply({
        content: 'No players available in the database right now.',
        flags: MessageFlags.Ephemeral
      });
    }

    // 4. Selección Ponderada por Media (Overall)
    const probabilidades = [
      { rango: [80, 81], prob: 0.35 },
      { rango: [82, 82], prob: 0.30 },
      { rango: [83, 83], prob: 0.20 },
      { rango: [84, 84], prob: 0.10 },
      { rango: [85, 86], prob: 0.03 },
      { rango: [87, 87], prob: 0.015 },
      { rango: [88, 88], prob: 0.01 },
      { rango: [89, 90], prob: 0.005 },
      { rango: [91, 91], prob: 0.003 },
      { rango: [92, 92], prob: 0.002 },
      { rango: [93, 94], prob: 0.001 },
      { rango: [95, 99], prob: 0.0005 }
    ];

    const pool = [];
    for (const { rango, prob } of probabilidades) {
      const filtered = allPlayers.filter(p => p.overall >= rango[0] && p.overall <= rango[1]);
      const weight = Math.round(prob * 1000);
      for (const player of filtered) {
        for (let i = 0; i < weight; i++) pool.push(player);
      }
    }

    // Fallback: si no hay jugadores en los rangos, elegir uno al azar
    const chosenPlayer = pool.length > 0
      ? pool[Math.floor(Math.random() * pool.length)]
      : allPlayers[Math.floor(Math.random() * allPlayers.length)];

    // 5. Registrar Cooldown
    cooldowns.set(discordId, Date.now() + COOLDOWN_DURATION);

    // 6. Añadir el jugador a la colección del usuario en la colección UserPlayer
    //    (exactamente igual que cuando se abre un sobre en la web)
    const userPlayer = await UserPlayerModel.create({
      user_id: webUser._id,   // ObjectId del User de la web
      player_id: chosenPlayer._id, // ObjectId del Player
      isTradeable: true
    });

    // 7. Preparar imagen (adjunto local o URL)
    const { embedUrl, files } = getPlayerImageAttachment(chosenPlayer.image);

    // 8. Construir el embed con TODA la info que muestra la web en PlayerDetail
    const s = chosenPlayer.stats || {};

    // Construir línea de posiciones (principal + alternativas)
    const allPositions = [chosenPlayer.position, ...(chosenPlayer.secondaryPositions || [])].filter(Boolean);
    const positionsStr = allPositions.map(p => `\`${p}\``).join('  ');

    // Play styles (si los tiene)
    const playStylesStr = chosenPlayer.playStyles?.length > 0
      ? chosenPlayer.playStyles.map(ps => ps.name).join(' • ')
      : null;

    // Color del embed según la media (igual que la web)
    let embedColor = 0x888888;
    if (chosenPlayer.overall >= 95) embedColor = 0xffd700;
    else if (chosenPlayer.overall >= 90) embedColor = 0xc9a752;
    else if (chosenPlayer.overall >= 85) embedColor = 0x22c55e;
    else if (chosenPlayer.overall >= 80) embedColor = 0x4f8ef7;

    const embed = new EmbedBuilder()
      .setColor(0xaa1c5f)
      .setTitle(`${chosenPlayer.name}${chosenPlayer.promo ? `  ·  ${chosenPlayer.promo}` : ''}`)
      .setDescription(
        `${positionsStr ? `**${positionsStr}**  ·  ` : ''}⭐ **${chosenPlayer.overall}**\n` +
        `${chosenPlayer.club?.name || ''}${chosenPlayer.nation?.name ? `  ·  ${chosenPlayer.nation.name}` : ''}\n\n` +
        `\`PAC ${s.pac ?? '—'}\`  \`SHO ${s.sho ?? '—'}\`  \`PAS ${s.pas ?? '—'}\`  \`DRI ${s.dri ?? '—'}\`  \`DEF ${s.def ?? '—'}\`  \`PHY ${s.phy ?? '—'}\`` +
        (playStylesStr ? `\n\n${playStylesStr}` : '')
      )
      .setImage(embedUrl)
      .setFooter({ text: `Claimed • ${new Date().toLocaleString('en-US')} • Added to your web collection` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`quick_sell_${userPlayer._id}`)
        .setLabel('Quick Sell')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setLabel('View on Web')
        .setURL(process.env.ASSETS_BASE_URL || 'http://localhost:5173')
        .setStyle(ButtonStyle.Link)
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      files
    });
    const message = await interaction.fetchReply();

    // 9. Colector del botón de venta rápida
    const filter = i => i.customId === `quick_sell_${userPlayer._id}` && i.user.id === discordId;
    const collector = message.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async i => {
      await i.deferUpdate();

      // Eliminar la carta directamente de UserPlayer (igual que discard en la web)
      const deleted = await UserPlayerModel.findOneAndDelete({
        _id: userPlayer._id,
        user_id: webUser._id
      });

      if (deleted) {
        const soldEmbed = new EmbedBuilder()
          .setTitle('Player discarded')
          .setDescription(`\`${chosenPlayer.name}\` was removed from your collection.`)
          .setThumbnail(embedUrl)
          .setColor(0x888888)
          .setFooter({ text: 'Transaction completed' });

        await interaction.editReply({ embeds: [soldEmbed], components: [] });
        collector.stop('sold');
      } else {
        await i.followUp({ content: 'This player is no longer in your inventory.', flags: MessageFlags.Ephemeral });
      }
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`quick_sell_${userPlayer._id}`)
            .setLabel('Time Expired')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setLabel('View on Web')
            .setURL(process.env.ASSETS_BASE_URL || 'http://localhost:5173')
            .setStyle(ButtonStyle.Link)
        );
        interaction.editReply({ components: [disabledRow] }).catch(console.error);
      }
    });

  } catch (error) {
    console.error('Error executing /claim command:', error);
    await interaction.reply({
      content: 'An internal error occurred while trying to claim a player.',
      flags: MessageFlags.Ephemeral
    });
  }
}
