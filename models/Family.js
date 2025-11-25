const mongoose = require('mongoose');

const FamilySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  members: {
    type: Number,
    required: true,
    min: 0,
    max: 10
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  }
}, {
  timestamps: true
});

FamilySchema.index({ group: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Family', FamilySchema);

