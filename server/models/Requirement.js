const mongoose = require('mongoose');

const RequirementSchema = new mongoose.Schema({
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewSession', required: true },
  description: { type: String, required: true }, // The requirement text
  priority: { 
    type: String, 
    enum: ['high', 'medium', 'low'], 
    default: 'medium' 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'changes_requested'], 
    default: 'pending' 
  },
  approvals: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['approved', 'rejected', 'pending'] },
    comment: { type: String }
  }]
}, { timestamps: true });

module.exports = mongoose.model('Requirement', RequirementSchema);
