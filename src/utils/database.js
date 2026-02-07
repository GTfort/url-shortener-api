const mongoose = require("mongoose");
const logger = require("./logger");

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      const mongoURI =
        process.env.MONGO_URI || "mongodb://localhost:27017/urlshortener";

      this.connection = await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      });

      logger.info("Connected to MongoDB successfully");

      mongoose.connection.on("error", (err) => {
        logger.error("MongoDB connection error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        logger.warn("MongoDB disconnected");
      });
    } catch (error) {
      logger.error("MongoDB connection failed:", error);
      process.exit(1);
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      logger.info("MongoDB disconnected");
    }
  }
}

module.exports = new Database();
