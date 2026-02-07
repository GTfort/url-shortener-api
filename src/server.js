require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");
const routes = require("./routes");
const database = require("./utils/database");
const redisClient = require("./redis");
const logger = require("./utils/logger");
const controller = require("./controllers");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to databases
(async () => {
  await database.connect();
})();

// Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }),
);
app.use(
  cors({
    origin: process.env.NODE_ENV === "production" ? process.env.BASE_URL : "*",
    credentials: true,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
// Middleware to make req.query writable in Express v5
app.use((req, res, next) => {
  Object.defineProperty(req, "query", {
    value: { ...req.query },
    writable: true,
    configurable: true,
    enumerable: true,
  });
  next();
});
app.use(
  mongoSanitize({
    replaceWith: "_", // Replaces prohibited characters (like $) with an underscore
  }),
);
// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - ${req.ip}`);
  next();
});

// Routes
app.use("/api", routes);

// Redirect route (short code)
app.get("/:shortCode", controller.redirect);

// QR Code redirect route
app.get("/qr/:shortCode", controller.generateQR);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);

  // Handle different types of errors
  if (err.name === "ValidationError") {
    return res.status(400).json({
      error: "Validation Error",
      details: err.errors,
    });
  }

  if (err.name === "MongoError" && err.code === 11000) {
    return res.status(409).json({
      error: "Duplicate key error",
      message: "Resource already exists",
    });
  }

  res.status(500).json({
    error: "Internal server error",
    message:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Something went wrong",
  });
});

// 404 handler
app.use("/*splat", (req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource was not found",
  });
});

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info("Received shutdown signal, closing connections...");

  await database.disconnect();
  redisClient.client.quit();

  process.exit(0);
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Base URL: ${process.env.BASE_URL}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Promise Rejection:", err);
  server.close(() => process.exit(1));
});
