import mongoose from 'mongoose';

const playerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  groupKey: { type: String, index: true },
  promo: { type: String, index: true },
  image: { type: String, required: true },
  overall: { type: Number, required: true },
  position: { type: String, required: true },
  secondaryPositions: [{ type: String }],
  stats: {
    pac: { type: Number, required: true },
    sho: { type: Number, required: true },
    pas: { type: Number, required: true },
    dri: { type: Number, required: true },
    def: { type: Number, required: true },
    phy: { type: Number, required: true }
  },
  club: {
    name: { type: String, required: true },
    image: { type: String, required: true }
  },
  league: {
    name: { type: String },
    image: { type: String }
  },
  nation: {
    name: { type: String, required: true },
    image: { type: String, required: true }
  },
  playStyles: [{
    name: { type: String },
    image: { type: String }
  }]
}, { timestamps: true });

// Exportar el modelo apuntando a la colección 'players'
export default mongoose.model('Player', playerSchema);
