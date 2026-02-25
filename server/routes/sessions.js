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
    const { userId } = req.query;
    const filter = userId
      ? { $or: [{ owner: userId }, { participants: userId }] }
      : {};
    const sessions = await ReviewSession.find(filter)
      .populate('owner', 'name')
      .populate('participants', 'name')
      .sort({ createdAt: -1 });
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

router.put('/:id', async (req, res) => {
  try {
    const session = await ReviewSession.findByIdAndUpdate(req.params.id, req.body, { new: true })
      .populate('owner', 'name');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save simulation report
router.put('/:id/report', async (req, res) => {
  try {
    const { summary, finalReport, agents } = req.body;
    const session = await ReviewSession.findByIdAndUpdate(
      req.params.id,
      { simulationReport: { summary, finalReport, agents, savedAt: new Date() } },
      { new: true }
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Report saved', savedAt: session.simulationReport.savedAt });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const session = await ReviewSession.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
