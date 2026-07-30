import mongoose from 'mongoose';

const userPackSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  pack_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Pack', required: true },
  quantity: { type: Number, default: 1 }
}, { timestamps: true });

export default mongoose.models.UserPack || mongoose.model('UserPack', userPackSchema);
