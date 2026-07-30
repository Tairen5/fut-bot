import mongoose from 'mongoose';
import dotenv from 'dotenv';
import PackModel from './schemas/packSchema.js';
import PlayerModel from './schemas/playerSchema.js';

dotenv.config();

async function seedPacks() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Fetch all players to distribute them into packs
    const players = await PlayerModel.find({});
    console.log(`Found ${players.length} players in the database.`);

    if (players.length === 0) {
      console.log('No players found! Please run the player scraper first.');
      process.exit(1);
    }

    // Categorize players
    const bronzePlayers = players.filter(p => p.overall < 75);
    const silverPlayers = players.filter(p => p.overall >= 75 && p.overall <= 80);
    const goldPlayers = players.filter(p => p.overall > 80 && p.overall <= 88);
    const premiumPlayers = players.filter(p => p.overall > 85);

    // Clear existing packs
    await PackModel.deleteMany({});
    console.log('Cleared existing packs.');

    // Create Bronze Pack
    const bronzePack = new PackModel({
      name: 'Bronze Pack',
      price: 5000,
      numCards: 3,
      image: 'bronze',
      possibleCards: [
        ...bronzePlayers.map(p => ({ player_id: p._id, weight: 100 })), // Very common
        ...silverPlayers.map(p => ({ player_id: p._id, weight: 10 }))   // Rare in bronze pack
      ]
    });

    // Create Silver Pack
    const silverPack = new PackModel({
      name: 'Silver Pack',
      price: 15000,
      numCards: 3,
      image: 'silver',
      possibleCards: [
        ...bronzePlayers.map(p => ({ player_id: p._id, weight: 20 })),
        ...silverPlayers.map(p => ({ player_id: p._id, weight: 100 })),
        ...goldPlayers.map(p => ({ player_id: p._id, weight: 5 }))
      ]
    });

    // Create Gold Pack
    const goldPack = new PackModel({
      name: 'Gold Pack',
      price: 50000,
      numCards: 3,
      image: 'gold',
      possibleCards: [
        ...silverPlayers.map(p => ({ player_id: p._id, weight: 20 })),
        ...goldPlayers.map(p => ({ player_id: p._id, weight: 100 })),
        ...premiumPlayers.map(p => ({ player_id: p._id, weight: 5 }))
      ]
    });

    // Create Premium Pack
    const premiumPack = new PackModel({
      name: 'Premium Pack',
      price: 150000,
      numCards: 5,
      image: 'premium',
      possibleCards: [
        ...goldPlayers.map(p => ({ player_id: p._id, weight: 50 })),
        ...premiumPlayers.map(p => ({ player_id: p._id, weight: 100 }))
      ]
    });

    await PackModel.insertMany([bronzePack, silverPack, goldPack, premiumPack]);
    console.log('Successfully seeded 4 standard packs!');

    process.exit(0);
  } catch (error) {
    console.error('Error seeding packs:', error);
    process.exit(1);
  }
}

seedPacks();
