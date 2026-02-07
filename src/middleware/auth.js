const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

const auth = {
  // JWT Authentication
  authenticateToken: async (req, res, next) => {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).json({ error: "Access token required" });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("-password");

      if (!user || !user.isActive) {
        return res.status(401).json({ error: "User not found or inactive" });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error("Authentication error:", error);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
  },

  // API Key Authentication
  authenticateApiKey: async (req, res, next) => {
    try {
      const apiKey = req.headers["x-api-key"] || req.query.apiKey;

      if (!apiKey) {
        return res.status(401).json({ error: "API key required" });
      }

      const user = await User.findOne({ apiKey }).select("-password");

      if (!user || !user.isActive) {
        return res.status(401).json({ error: "Invalid API key" });
      }

      req.user = user;
      next();
    } catch (error) {
      logger.error("API key authentication error:", error);
      return res.status(403).json({ error: "Authentication failed" });
    }
  },

  // Role-based authorization
  authorizeRole: (...roles) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          error: `Access denied. Required roles: ${roles.join(", ")}`,
        });
      }

      next();
    };
  },

  // Generate JWT token
  generateToken: (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });
  },
};

module.exports = auth;
