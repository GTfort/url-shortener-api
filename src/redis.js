const redis = require("redis");

class RedisClient {
  constructor() {
    this.client = redis.createClient({
      socket: {
        host: process.env.REDIS_HOST || "localhost",
        port: process.env.REDIS_PORT || 6379,
      },
      password: process.env.REDIS_PASSWORD || "",
    });

    this.client.on("error", (err) => console.error("Redis Error:", err));
    this.client.on("connect", () => console.log("Connected to Redis"));

    // Explicitly connect (Required in v4+)
    this.client.connect().catch(console.error);
  }

  // Store URL with expiration (default 24 hours)
  async setURL(shortCode, longUrl, expiry = 86400) {
    // In v4, use setEx or set with an options object
    await this.client.setEx(`url:${shortCode}`, expiry, longUrl);
  }

  // Get URL by short code
  async getURL(shortCode) {
    return await this.client.get(`url:${shortCode}`);
  }

  // Check if short code exists
  async exists(shortCode) {
    // Note: exists() in v4 returns a number (0 or 1)
    return await this.client.exists(`url:${shortCode}`);
  }

  // Increment click counter
  async incrementClicks(shortCode) {
    const key = `clicks:${shortCode}`;
    await this.client.incr(key);
  }

  // Get click count
  async getClicks(shortCode) {
    const val = await this.client.get(`clicks:${shortCode}`);
    return val ? parseInt(val) : 0;
  }

  // Rate limiting
  async rateLimit(ip, window = 3600, max = 100) {
    const key = `rate:${ip}`;
    const current = await this.client.incr(key);

    if (current === 1) {
      await this.client.expire(key, window);
    }

    return current <= max;
  }
}

module.exports = new RedisClient();
