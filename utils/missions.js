import ObjectiveModel from '../schemas/objectiveSchema.js';
import UserObjectiveModel from '../schemas/userObjectiveSchema.js';

export async function updateMissionProgress(userId, type, amount = 1) {
  try {
    const activeObjectives = await ObjectiveModel.find({ isActive: true, type });
    if (activeObjectives.length === 0) return;

    for (const obj of activeObjectives) {
      let uo = await UserObjectiveModel.findOne({ user_id: userId, objective_id: obj._id });
      
      if (!uo) {
        uo = new UserObjectiveModel({
          user_id: userId,
          objective_id: obj._id,
          progress: 0
        });
      }

      if (uo.progress < obj.targetValue) {
        uo.progress += amount;
        if (uo.progress >= obj.targetValue) {
          uo.isCompleted = true;
          uo.progress = obj.targetValue;
        }
        await uo.save();
      }
    }
  } catch (error) {
    console.error('Error updating mission progress:', error);
  }
}
