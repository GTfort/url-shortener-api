const redisClient = require("./redis");
const { generateShortCode, isValidUrl } = require("./helpers");
const Url = require("./models/Url");
const User = require("./models/User");
const auth = require("./middleware/auth");
const analyticsService = require("./services/analytics");
const qrCodeService = require("./services/qrcode");
const logger = require("./utils/logger");

class URLController {
  // Shorten URL (with authentication support)
  async shorten(req, res) {
    try {
      const { longUrl, customCode, expiresInDays, metadata } = req.body;
      const userId = req.user ? req.user._id : null;

      // Validate URL
      if (!isValidUrl(longUrl)) {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      // Rate limiting (different limits for authenticated vs anonymous)
      const ip = req.ip;
      const limitKey = userId ? `user:${userId}:limit` : `ip:${ip}:limit`;
      const canProceed = await redisClient.rateLimit(limitKey);

      if (!canProceed) {
        return res.status(429).json({
          error: "Rate limit exceeded. Please try again later.",
        });
      }

      // Check if custom code already exists
      let shortCode = customCode || generateShortCode();

      if (customCode) {
        const existing = await Url.findOne({
          $or: [{ shortCode: customCode }, { customCode: customCode }],
        });

        if (existing) {
          return res.status(409).json({
            error: "Custom code already taken",
          });
        }
      } else {
        // Ensure generated code is unique
        let isUnique = false;
        let attempts = 0;
        const maxAttempts = 5;

        while (!isUnique && attempts < maxAttempts) {
          const existing = await Url.findOne({ shortCode });
          if (!existing) {
            isUnique = true;
          } else {
            shortCode = generateShortCode();
            attempts++;
          }
        }

        if (!isUnique) {
          return res.status(500).json({
            error: "Failed to generate unique short code",
          });
        }
      }

      // Set expiration date
      const expiresAt = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Save to MongoDB
      const urlDoc = new Url({
        shortCode,
        longUrl,
        userId,
        customCode: customCode || undefined,
        expiresAt,
        metadata: metadata || {},
      });

      await urlDoc.save();

      // Cache in Redis
      await redisClient.cacheURL(shortCode, longUrl, userId);

      const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

      // Generate QR code data URL
      const qrCode = await qrCodeService.generateQRCode(shortUrl);

      res.status(201).json({
        success: true,
        shortUrl,
        shortCode,
        longUrl,
        expiresAt: urlDoc.expiresAt,
        qrCode: qrCode.dataUrl,
        analyticsUrl: `${process.env.BASE_URL}/api/urls/${shortCode}/stats`,
      });

      logger.info(`URL shortened: ${shortCode} -> ${longUrl}`);
    } catch (error) {
      logger.error("Shorten URL error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // Redirect to original URL
  async redirect(req, res) {
    try {
      const { shortCode } = req.params;

      // Try Redis cache first
      let longUrl = await redisClient.getURL(shortCode);
      let urlDoc = null;

      if (!longUrl) {
        // Cache miss, check MongoDB
        urlDoc = await Url.findOne({
          shortCode,
          isActive: true,
          expiresAt: { $gt: new Date() },
        });

        if (!urlDoc) {
          return res.status(404).json({ error: "URL not found or expired" });
        }

        longUrl = urlDoc.longUrl;

        // Update cache
        await redisClient.cacheURL(shortCode, longUrl, urlDoc.userId);

        // Increment click count in DB
        urlDoc.clicks += 1;
        await urlDoc.save();
      } else {
        // Cache hit, still update click count async
        Url.updateOne({ shortCode }, { $inc: { clicks: 1 } }).exec();
      }

      // Track analytics
      await analyticsService.trackClick(shortCode, req);

      // Redirect
      res.redirect(301, longUrl);
    } catch (error) {
      logger.error("Redirect error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // Get URL stats
  async stats(req, res) {
    try {
      const { shortCode } = req.params;
      const userId = req.user ? req.user._id : null;

      // Get URL document
      const urlDoc = await Url.findOne({ shortCode });

      if (!urlDoc) {
        return res.status(404).json({ error: "URL not found" });
      }

      // Check authorization (users can only see their own URLs unless admin)
      if (
        userId &&
        urlDoc.userId &&
        !urlDoc.userId.equals(userId) &&
        req.user.role !== "admin"
      ) {
        return res.status(403).json({
          error: "Not authorized to view these stats",
        });
      }

      // Get analytics summary
      const summary = await analyticsService.getSummary(shortCode);
      const realtime = await analyticsService.getRealtimeStats(shortCode);

      res.json({
        shortCode,
        longUrl: urlDoc.longUrl,
        shortUrl: `${process.env.BASE_URL}/${shortCode}`,
        clicks: urlDoc.clicks,
        createdAt: urlDoc.createdAt,
        expiresAt: urlDoc.expiresAt,
        isActive: urlDoc.isActive,
        metadata: urlDoc.metadata,
        summary,
        realtime,
      });
    } catch (error) {
      logger.error("Stats error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // User authentication
  async register(req, res) {
    try {
      const { username, email, password } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }],
      });

      if (existingUser) {
        return res.status(409).json({
          error: "User with this email or username already exists",
        });
      }

      // Create user
      const user = new User({
        username,
        email,
        password,
      });

      await user.save();

      // Generate JWT token
      const token = auth.generateToken(user._id);

      // Generate API key
      const apiKey = user.generateApiKey();
      await user.save();

      res.status(201).json({
        success: true,
        message: "User registered successfully",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        token,
        apiKey,
      });
    } catch (error) {
      logger.error("Registration error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });

      if (!user || !user.isActive) {
        return res.status(401).json({
          error: "Invalid credentials or account inactive",
        });
      }

      // Check password
      const isMatch = await user.comparePassword(password);

      if (!isMatch) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Generate JWT token
      const token = auth.generateToken(user._id);

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
        },
        token,
      });
    } catch (error) {
      logger.error("Login error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // QR Code generation endpoint
  async generateQR(req, res) {
    try {
      const { shortCode, size = 300, format = "png" } = req.params;

      // Get URL
      const urlDoc = await Url.findOne({ shortCode });

      if (!urlDoc) {
        return res.status(404).json({ error: "URL not found" });
      }

      const shortUrl = `${process.env.BASE_URL}/${shortCode}`;

      if (format === "svg") {
        const qrResult = await qrCodeService.generateQRCodeFile(
          shortUrl,
          "svg",
        );
        res.setHeader("Content-Type", "image/svg+xml");
        res.send(qrResult.content);
      } else {
        const qrResult = await qrCodeService.generateQRCodeFile(
          shortUrl,
          format,
        );
        res.setHeader("Content-Type", qrResult.mimeType);
        res.send(qrResult.buffer);
      }
    } catch (error) {
      logger.error("QR Code generation error:", error);
      res.status(500).json({
        error: "Failed to generate QR code",
        message: error.message,
      });
    }
  }

  // User's URLs list
  async getUserUrls(req, res) {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 20 } = req.query;

      const skip = (page - 1) * limit;

      const [urls, total] = await Promise.all([
        Url.find({ userId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Url.countDocuments({ userId }),
      ]);

      res.json({
        success: true,
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
        urls: urls.map((url) => ({
          shortCode: url.shortCode,
          shortUrl: url.shortUrl,
          longUrl: url.longUrl,
          clicks: url.clicks,
          createdAt: url.createdAt,
          expiresAt: url.expiresAt,
          isActive: url.isActive,
        })),
      });
    } catch (error) {
      logger.error("Get user URLs error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // Delete URL
  async deleteUrl(req, res) {
    try {
      const { shortCode } = req.params;
      const userId = req.user._id;

      const urlDoc = await Url.findOne({ shortCode });

      if (!urlDoc) {
        return res.status(404).json({ error: "URL not found" });
      }

      // Check authorization
      if (!urlDoc.userId || !urlDoc.userId.equals(userId)) {
        return res.status(403).json({
          error: "Not authorized to delete this URL",
        });
      }

      // Delete from MongoDB
      await Url.deleteOne({ _id: urlDoc._id });

      // Invalidate cache
      await redisClient.invalidateURL(shortCode, userId);

      res.json({
        success: true,
        message: "URL deleted successfully",
      });
    } catch (error) {
      logger.error("Delete URL error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }

  // Update URL
  async updateUrl(req, res) {
    try {
      const { shortCode } = req.params;
      const { longUrl, isActive, expiresInDays, metadata } = req.body;
      const userId = req.user._id;

      const urlDoc = await Url.findOne({ shortCode });

      if (!urlDoc) {
        return res.status(404).json({ error: "URL not found" });
      }

      // Check authorization
      if (!urlDoc.userId || !urlDoc.userId.equals(userId)) {
        return res.status(403).json({
          error: "Not authorized to update this URL",
        });
      }

      // Update fields
      if (longUrl && isValidUrl(longUrl)) {
        urlDoc.longUrl = longUrl;
      }

      if (typeof isActive === "boolean") {
        urlDoc.isActive = isActive;
      }

      if (expiresInDays) {
        urlDoc.expiresAt = new Date(
          Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
        );
      }

      if (metadata) {
        urlDoc.metadata = { ...urlDoc.metadata, ...metadata };
      }

      await urlDoc.save();

      // Update cache if longUrl changed
      if (longUrl) {
        await redisClient.cacheURL(shortCode, urlDoc.longUrl, userId);
      }

      res.json({
        success: true,
        message: "URL updated successfully",
        url: {
          shortCode: urlDoc.shortCode,
          shortUrl: urlDoc.shortUrl,
          longUrl: urlDoc.longUrl,
          clicks: urlDoc.clicks,
          createdAt: urlDoc.createdAt,
          expiresAt: urlDoc.expiresAt,
          isActive: urlDoc.isActive,
        },
      });
    } catch (error) {
      logger.error("Update URL error:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error.message,
      });
    }
  }
}

module.exports = new URLController();
