const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  role: { 
    type: String, 
    enum: ['owner', 'stakeholder', 'pm', 'dev'], 
    default: 'stakeholder' 
  },
  country: { type: String, default: 'Global' }, // For stakeholders
  avatar: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
