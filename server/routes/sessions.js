const express = require('express');
const router = express.Router();
const ReviewSession = require('../models/ReviewSession');

router.post('/', async (req, res) => {
  try {
    const session = new ReviewSession(req.body);
    await session.save();
    res.status(201).json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const sessions = await ReviewSession.find()
      .populate('owner', 'name')
      .populate('participants', 'name');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (!req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ error: 'Invalid Session ID format' });
    }
    const session = await ReviewSession.findById(req.params.id)
      .populate('owner')
      .populate('participants');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
