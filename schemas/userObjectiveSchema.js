import mongoose from 'mongoose';

const userObjectiveSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  objective_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Objective', required: true },
  progress: { type: Number, default: 0 },
  isCompleted: { type: Boolean, default: false },
  isClaimed: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.models.UserObjective || mongoose.model('UserObjective', userObjectiveSchema);
