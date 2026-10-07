const mongoose = require('mongoose');

/**
 * AI-written questions for one game in one learning language.
 * Generated once, then reused for every match so players never wait twice.
 */
const gamePuzzleSetSchema = new mongoose.Schema(
  {
    gameKey: { type: String, required: true },
    language: { type: String, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
);

gamePuzzleSetSchema.index({ gameKey: 1, language: 1 }, { unique: true });

const GamePuzzleSet = mongoose.model('GamePuzzleSet', gamePuzzleSetSchema);

module.exports = { GamePuzzleSet };
