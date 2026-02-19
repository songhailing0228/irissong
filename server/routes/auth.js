const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/login', async (req, res) => {
  try {
    const { name, role, country } = req.body;
    let user = await User.findOne({ name });
    
    if (!user) {
      user = new User({ name, role, country });
      await user.save();
    }
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
