import mongoose from 'mongoose';

const packSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  numCards: { type: Number, required: true },
  type: { type: String, default: 'store', enum: ['store', 'claim', 'draft', 'reward'] },
  image: { type: String }, // 'gold', 'silver', 'premium', etc.
  possibleCards: [{
    player_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
    weight: { type: Number, default: 1 }
  }]
}, { timestamps: true });

export default mongoose.models.Pack || mongoose.model('Pack', packSchema);
