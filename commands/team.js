import { SlashCommandBuilder, AttachmentBuilder, MessageFlags } from 'discord.js';
import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';

import UserModel from '../schemas/userSchema.js';
import SquadModel from '../schemas/squadSchema.js';

// ─── Constantes ────────────────────────────────────────────────────────────────
const CARDS_LOCAL_PATH = 'c:/Users/Javi/Desktop/fut-web/frontend/public/player-cards';
const BACKGROUND_URL = 'https://imgur.com/ArczBYC.png';

// Coordenadas para 11 jugadores basadas en positionIndex (4-3-3 aproximado)
const POSITIONS = {
  0:  { x: 775,  y: 720 }, // GK
  1:  { x: 300,  y: 600 }, // LB
  2:  { x: 550,  y: 620 }, // CB1
  3:  { x: 1000, y: 620 }, // CB2
  4:  { x: 1250, y: 600 }, // RB
  5:  { x: 400,  y: 450 }, // CM1
  6:  { x: 775,  y: 450 }, // CM2
  7:  { x: 1150, y: 450 }, // CM3
  8:  { x: 350,  y: 250 }, // LW
  9:  { x: 775,  y: 215 }, // ST
  10: { x: 1200, y: 250 }  // RW
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getPlayerImageSource(imageName) {
  if (!imageName) return 'https://i.imgur.com/8m4Y4zX.png';
  if (imageName.startsWith('http')) return imageName;

  const localPath = path.join(CARDS_LOCAL_PATH, imageName);
  if (fs.existsSync(localPath)) {
    return localPath; // canvas.loadImage acepta rutas locales absolutas
  }

  const baseUrl = process.env.ASSETS_BASE_URL || 'http://localhost:5173';
  return `${baseUrl}/player-cards/${imageName}`;
}

// ─── Command definition ────────────────────────────────────────────────────────

// Position labels for text mode
const POSITION_LABELS = {
  0: 'GK', 1: 'LB', 2: 'CB', 3: 'CB', 4: 'RB',
  5: 'CM', 6: 'CM', 7: 'CM', 8: 'LW', 9: 'ST', 10: 'RW'
};

export const data = new SlashCommandBuilder()
  .setName('team')
  .setDescription('Shows your active team layout on the pitch')
  .addBooleanOption(option =>
    option.setName('text')
      .setDescription('Show team as text instead of image')
      .setRequired(false)
  );

// ─── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply();

  try {
    const discordId = interaction.user.id;

    // 1. Fetch user
    const webUser = await UserModel.findOne({ discordId });
    if (!webUser) {
      return interaction.editReply({ content: '❌ Profile not found. Log in at the website first.' });
    }

    // 2. Fetch active squad & populate players
    const squad = await SquadModel.findOne({ user_id: webUser._id, isActive: true })
      .populate({
        path: 'startingEleven.user_player_id',
        populate: { path: 'player_id' }
      });

    if (!squad || !squad.startingEleven || squad.startingEleven.length === 0) {
      return interaction.editReply('Your squad is empty. Use `/add` to put players in your team.');
    }

    // 3. Check if text mode requested
    const textMode = interaction.options.getBoolean('text') ?? false;

    if (textMode) {
      // Sort by positionIndex so it reads GK -> DEF -> MID -> ATK
      const sorted = [...squad.startingEleven]
        .filter(s => s.user_player_id?.player_id)
        .sort((a, b) => a.positionIndex - b.positionIndex);

      const lines = sorted.map((slot, idx) => {
        const p = slot.user_player_id.player_id;
        const posLabel = POSITION_LABELS[slot.positionIndex] ?? '?';
        return `${idx + 1}. **${posLabel}** - ${p.name} OVR ${p.overall}`;
      });

      const { EmbedBuilder } = await import('discord.js');
      const textEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(`${webUser.discordUsername}'s Team`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${sorted.length}/11 players` });

      return interaction.editReply({ embeds: [textEmbed] });
    }

    // 3. Setup canvas and background
    const canvas = createCanvas(1550, 817);
    const ctx = canvas.getContext('2d');

    try {
      const background = await loadImage(BACKGROUND_URL);
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.error('Error loading background image:', err);
      return interaction.editReply('Error loading the pitch background. Please try again later.');
    }

    // 4. Draw each player
    const maxImageSize = 210;

    for (const slot of squad.startingEleven) {
      if (!slot.user_player_id || !slot.user_player_id.player_id) continue;

      const p = slot.user_player_id.player_id;
      const pos = POSITIONS[slot.positionIndex];

      if (pos) {
        try {
          const imageSrc = getPlayerImageSource(p.image);
          const playerImage = await loadImage(imageSrc);
          
          const scale = Math.min(maxImageSize / playerImage.width, maxImageSize / playerImage.height);
          const imageWidth = playerImage.width * scale;
          const imageHeight = playerImage.height * scale;
          
          ctx.drawImage(
            playerImage, 
            pos.x - imageWidth / 2, 
            pos.y - imageHeight / 2, 
            imageWidth, 
            imageHeight
          );
        } catch (err) {
          console.error(`Error loading image for player ${p.name}:`, err);
        }
      }
    }

    // 5. Generate and send image
    const buffer = canvas.toBuffer('image/png');
    const attachment = new AttachmentBuilder(buffer, { name: 'team.png' });

    await interaction.editReply({ files: [attachment] });

  } catch (error) {
    console.error('Error in /team command:', error);
    await interaction.editReply('There was an error while executing the command.');
  }
}
