const redisClient = require("./redis");
const { generateShortCode, isValidUrl } = require("./helpers");

class URLController {
  // Shorten URL
  async shorten(req, res) {
    try {
      const { longUrl, customCode } = req.body;

      // Validate URL
      if (!isValidUrl(longUrl)) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Check rate limiting
      const ip = req.ip;
      const canProceed = await redisClient.rateLimit(ip);
      if (!canProceed) {
        return res.status(429).json({ error: "Rate limit exceeded" });
      }

      // Generate or use custom code
      let shortCode = customCode || generateShortCode();

      // Check if custom code already exists
      if (customCode) {
        const exists = await redisClient.exists(customCode);
        if (exists) {
          return res.status(409).json({ error: "Custom code already taken" });
        }
      }

      // Store in Redis
      await redisClient.setURL(shortCode, longUrl);

      const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

      res.status(201).json({
        success: true,
        shortUrl,
        shortCode,
        longUrl,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Redirect to original URL
  async redirect(req, res) {
    try {
      const { shortCode } = req.params;

      // Get URL from Redis
      const longUrl = await redisClient.getURL(shortCode);

      if (!longUrl) {
        return res.status(404).json({ error: "URL not found" });
      }

      // Increment click counter
      await redisClient.incrementClicks(shortCode);

      // Redirect
      res.redirect(301, longUrl);
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }

  // Get URL stats
  async stats(req, res) {
    try {
      const { shortCode } = req.params;

      const longUrl = await redisClient.getURL(shortCode);

      if (!longUrl) {
        return res.status(404).json({ error: "URL not found" });
      }

      const clicks = await redisClient.getClicks(shortCode);

      res.json({
        shortCode,
        longUrl,
        clicks: parseInt(clicks),
        shortUrl: `${process.env.BASE_URL}/${shortCode}`,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}

module.exports = new URLController();
