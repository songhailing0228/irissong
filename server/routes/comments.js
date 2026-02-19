const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');

router.post('/', async (req, res) => {
  try {
    const comment = new Comment(req.body);
    await comment.save();
    
    const populatedComment = await Comment.findById(comment._id).populate('author', 'name role');
    res.status(201).json(populatedComment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/requirement/:requirementId', async (req, res) => {
  try {
    const comments = await Comment.find({ requirement: req.params.requirementId })
      .populate('author', 'name role')
      .sort({ createdAt: 1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
