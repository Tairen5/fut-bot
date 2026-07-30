import mongoose from 'mongoose';

const objectiveSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, required: true, enum: ['OPEN_PACKS', 'SELL_PLAYERS', 'BUY_PACKS'] },
  targetValue: { type: Number, required: true },
  rewardType: { type: String, required: true, enum: ['coins', 'pack'] },
  rewardValue: { type: mongoose.Schema.Types.Mixed, required: true }, // Number for coins, ObjectId for pack
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.models.Objective || mongoose.model('Objective', objectiveSchema);
