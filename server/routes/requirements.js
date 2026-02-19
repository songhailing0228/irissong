const express = require('express');
const router = express.Router();
const Requirement = require('../models/Requirement');

router.post('/', async (req, res) => {
  try {
    const requirement = new Requirement(req.body);
    await requirement.save();
    res.status(201).json(requirement);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const requirements = await Requirement.find({ session: req.params.sessionId })
      .populate('approvals.user', 'name role country');
    res.json(requirements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/approve', async (req, res) => {
  try {
    const { userId, status, comment } = req.body;
    const requirement = await Requirement.findById(req.params.id);
    
    const existingIndex = requirement.approvals.findIndex(a => a.user.toString() === userId);
    if (existingIndex > -1) {
      requirement.approvals[existingIndex] = { user: userId, status, comment };
    } else {
      requirement.approvals.push({ user: userId, status, comment });
    }
    
    await requirement.save();
    res.json(requirement);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
