const express = require("express");
const controller = require("./controllers");
const router = express.Router();

// Shorten URL
router.post("/shorten", controller.shorten);

// Get URL stats
router.get("/stats/:shortCode", controller.stats);

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

module.exports = router;
