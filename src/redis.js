const redis = require("redis");
const { promisify } = require("util");

class RedisClient {
  constructor() {
    this.client = redis.createClient({
      host: process.env.REDIS_HOST || "localhost",
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || "",
    });

    this.client.on("error", (err) => {
      console.error("Redis Error:", err);
    });

    this.client.on("connect", () => {
      console.log("Connected to Redis");
    });

    // Promisify Redis methods for async/await
    this.getAsync = promisify(this.client.get).bind(this.client);
    this.setAsync = promisify(this.client.set).bind(this.client);
    this.setexAsync = promisify(this.client.setex).bind(this.client);
    this.existsAsync = promisify(this.client.exists).bind(this.client);
    this.incrAsync = promisify(this.client.incr).bind(this.client);
    this.expireAsync = promisify(this.client.expire).bind(this.client);
  }

  // Store URL with expiration (default 24 hours)
  async setURL(shortCode, longUrl, expiry = 86400) {
    await this.setexAsync(`url:${shortCode}`, expiry, longUrl);
  }

  // Get URL by short code
  async getURL(shortCode) {
    return await this.getAsync(`url:${shortCode}`);
  }

  // Check if short code exists
  async exists(shortCode) {
    return await this.existsAsync(`url:${shortCode}`);
  }

  // Increment click counter
  async incrementClicks(shortCode) {
    const key = `clicks:${shortCode}`;
    await this.incrAsync(key);
  }

  // Get click count
  async getClicks(shortCode) {
    return (await this.getAsync(`clicks:${shortCode}`)) || 0;
  }

  // Rate limiting
  async rateLimit(ip, window = 3600, max = 100) {
    const key = `rate:${ip}`;
    const current = await this.incrAsync(key);

    if (current === 1) {
      await this.expireAsync(key, window);
    }

    return current <= max;
  }
}

module.exports = new RedisClient();
