import mongoose from 'mongoose';
import dotenv from 'dotenv';
import ObjectiveModel from './schemas/objectiveSchema.js';
import PackModel from './schemas/packSchema.js';
import UserObjectiveModel from './schemas/userObjectiveSchema.js';

dotenv.config();

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing objectives
    await ObjectiveModel.deleteMany({});
    await UserObjectiveModel.deleteMany({});
    console.log('Cleared existing objectives.');

    // Fetch packs to use as rewards
    const bronzePack = await PackModel.findOne({ name: 'Bronze Pack' });
    const draftPack = await PackModel.findOne({ type: 'draft' });

    const objectives = [
      {
        name: 'Pack Opener I',
        description: 'Open 3 packs from your inventory.',
        type: 'OPEN_PACKS',
        targetValue: 3,
        rewardType: 'coins',
        rewardValue: 5000,
        isActive: true
      },
      {
        name: 'First Sale',
        description: 'Sell 1 player on the market/quick sell.',
        type: 'SELL_PLAYERS',
        targetValue: 1,
        rewardType: 'coins',
        rewardValue: 2500,
        isActive: true
      },
      {
        name: 'Store Spender',
        description: 'Buy 2 packs from the store.',
        type: 'BUY_PACKS',
        targetValue: 2,
        rewardType: 'pack',
        rewardValue: bronzePack ? bronzePack._id : null,
        isActive: true
      },
      {
        name: 'Draft Master',
        description: 'Open 5 packs from your inventory.',
        type: 'OPEN_PACKS',
        targetValue: 5,
        rewardType: 'pack',
        rewardValue: draftPack ? draftPack._id : null,
        isActive: true
      }
    ];

    // Filter out objectives with null pack rewards
    const validObjectives = objectives.filter(obj => obj.rewardType === 'coins' || obj.rewardValue !== null);

    await ObjectiveModel.insertMany(validObjectives);
    console.log(`Successfully seeded ${validObjectives.length} objectives!`);

    process.exit(0);
  } catch (err) {
    console.error('Error seeding objectives:', err);
    process.exit(1);
  }
}

seed();
