const mongoose = require('mongoose');

const ReviewSessionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  docUrl: { type: String, required: true }, // Link to Feishu doc
  referenceDocs: [{
    url: String,
    note: String
  }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { 
    type: String, 
    enum: ['draft', 'in_review', 'completed', 'archived'], 
    default: 'draft' 
  },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ReviewSession', ReviewSessionSchema);
