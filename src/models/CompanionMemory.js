const mongoose = require('mongoose');

/**
 * Long-term memory a companion keeps about one user. Lives in its own collection so
 * memory writes never race with the (frequently saved) user document.
 */
const companionMemorySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    companionId: { type: String, required: true },
    facts: {
      type: [
        {
          _id: false,
          text: { type: String, required: true, maxlength: 240 },
          updatedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    userMessagesSinceExtract: { type: Number, default: 0 },
  },
  { timestamps: true },
);

companionMemorySchema.index({ userId: 1, companionId: 1 }, { unique: true });

const CompanionMemory = mongoose.model('CompanionMemory', companionMemorySchema);

module.exports = { CompanionMemory };
