const express = require("express");
const controller = require("./controllers");
const auth = require("./middleware/auth");
const rateLimit = require("express-rate-limit");
const router = express.Router();

// Public rate limiter
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Too many requests from this IP, please try again later.",
});

// Auth rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many authentication attempts, please try again later.",
});

// Public routes
router.post("/shorten", publicLimiter, controller.shorten);
router.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    services: {
      redis: "connected",
      mongo: "connected",
    },
  });
});

// Authentication routes
router.post("/auth/register", authLimiter, controller.register);
router.post("/auth/login", authLimiter, controller.login);

// Protected routes (require authentication)
router.get("/urls", auth.authenticateToken, controller.getUserUrls);
router.get("/urls/:shortCode/stats", auth.authenticateToken, controller.stats);
router.delete("/urls/:shortCode", auth.authenticateToken, controller.deleteUrl);
router.put("/urls/:shortCode", auth.authenticateToken, controller.updateUrl);

// QR Code routes
router.get("/qr/:shortCode", controller.generateQR);
router.get("/qr/:shortCode/:size", controller.generateQR);
router.get("/qr/:shortCode/:size/:format", controller.generateQR);

// API Key routes
router.post("/auth/api-key", auth.authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const apiKey = user.generateApiKey();
    await user.save();

    res.json({
      success: true,
      apiKey,
      message: "API key generated successfully",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate API key" });
  }
});

// Admin routes
router.get(
  "/admin/urls",
  auth.authenticateToken,
  auth.authorizeRole("admin"),
  async (req, res) => {
    try {
      const urls = await Url.find().sort({ createdAt: -1 }).limit(100);
      res.json(urls);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

module.exports = router;
