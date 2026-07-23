import mongoose from 'mongoose';

// Réplica del User model de la web (con campos Discord OAuth2)
const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  discordUsername: { type: String, required: true },
  discordAvatar: { type: String, default: null },
  currency: { type: Number, default: 0 },
  points: { type: Number, default: 0 },
  elo: { type: Number, default: 1000 },
  record: {
    wins: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    losses: { type: Number, default: 0 }
  }
}, { timestamps: true });

export default mongoose.model('User', userSchema);
