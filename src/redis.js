const redis = require("redis");
const logger = require("./utils/logger");

class RedisClient {
  constructor() {
    this.client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
      },
      password: process.env.REDIS_PASSWORD || "",
    });

    this.client.on("error", (err) => logger.error("Redis Error:", err));
    this.client.on("connect", () => logger.info("Connected to Redis"));

    // REQUIRED in v4+: Explicitly initiate connection
    this.client
      .connect()
      .catch((err) => logger.error("Initial Connection Error:", err));
  }

  // Cache URLs with different TTLs
  async cacheURL(shortCode, longUrl, userId = null) {
    const key = `url:${shortCode}`;
    const userKey = userId ? `user:${userId}:url:${shortCode}` : null;
    const ttl = userId ? 7 * 86400 : 86400;

    // v4 uses setEx or set with an options object
    await this.client.setEx(key, ttl, longUrl);
    if (userKey) await this.client.setEx(userKey, ttl, longUrl);
  }

  async getURL(shortCode) {
    const key = `url:${shortCode}`;
    const cached = await this.client.get(key); // Natively returns a Promise
    if (cached) {
      await this.client.expire(key, 86400);
      return cached;
    }
    return null;
  }

  async invalidateURL(shortCode, userId = null) {
    const keys = [`url:${shortCode}`];
    if (userId) {
      keys.push(
        `user:${userId}:url:${shortCode}`,
        `analytics:${shortCode}`,
        `clicks:${shortCode}`,
      );
    }
    // del can take an array or multiple arguments
    await this.client.del(keys);
    logger.info(`Cache invalidated for ${shortCode}`);
  }

  async storeAnalytics(shortCode, data) {
    const key = `analytics:${shortCode}`;
    const timestamp = Date.now().toString();
    // hSet accepts key, field, value
    await this.client.hSet(key, timestamp, JSON.stringify(data));
    await this.client.expire(key, 30 * 86400);
  }

  async getAnalytics(shortCode, startTime, endTime) {
    const key = `analytics:${shortCode}`;
    const allData = await this.client.hGetAll(key); // Returns an object in v4

    if (!allData || Object.keys(allData).length === 0) return [];

    return Object.entries(allData)
      .filter(([timestamp]) => {
        const ts = parseInt(timestamp);
        return ts >= startTime && ts <= endTime;
      })
      .map(([_, data]) => JSON.parse(data));
  }
}

module.exports = new RedisClient();
