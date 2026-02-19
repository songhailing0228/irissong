const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    // Use timestamp + random string + extension to avoid encoding issues and collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext)
  }
})

const upload = multer({ storage: storage });

router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  // Return the path relative to the project root or absolute path
  // simulation.js needs to know where to find it.
  // Let's return the filename and let simulation.js resolve it relative to uploads/
  res.json({ 
    filename: req.file.filename,
    path: req.file.path,
    relativePath: `uploads/${req.file.filename}`
  });
});

module.exports = router;
