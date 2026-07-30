import mongoose from 'mongoose';

const squadSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, default: 'Mi Squad' },
  formation: { type: String, default: '4-3-3' },
  isActive: { type: Boolean, default: true },
  startingEleven: [{
    positionIndex: { type: Number },
    user_player_id: { type: mongoose.Schema.Types.ObjectId, ref: 'UserPlayer' }
  }],
  bench: [{ type: mongoose.Schema.Types.ObjectId, ref: 'UserPlayer' }],
  tactics: {
    style: { type: String, default: 'Balanced' }
  },
  chemistry: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Squad', squadSchema);
