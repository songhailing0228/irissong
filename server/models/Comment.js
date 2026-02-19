const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewSession', required: true },
  requirement: { type: mongoose.Schema.Types.ObjectId, ref: 'Requirement' }, // Linked to specific requirement
  parentComment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' }, // For threading
  isResolved: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Comment', CommentSchema);
