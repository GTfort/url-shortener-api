const Url = require("../models/Url");
const redisClient = require("../redis");

class AnalyticsService {
  constructor() {
    this.analyticsCollection = {};
  }

  // Track click with detailed analytics
  async trackClick(shortCode, req) {
    const analyticsData = {
      timestamp: Date.now(),
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      referrer: req.headers["referer"] || "direct",
      country: req.headers["cf-ipcountry"] || "unknown",
      device: this.getDeviceType(req.headers["user-agent"]),
      browser: this.getBrowserInfo(req.headers["user-agent"]),
    };

    // Store in Redis for real-time access
    await redisClient.storeAnalytics(shortCode, analyticsData);

    // Store in MongoDB for persistent storage (async, non-blocking)
    this.saveToMongoDB(shortCode, analyticsData);

    // Update click count in cache
    await redisClient.incrementClicks(shortCode);

    return analyticsData;
  }

  async saveToMongoDB(shortCode, data) {
    try {
      const Url = require("../models/Url");
      await Url.updateOne(
        { shortCode },
        {
          $inc: { clicks: 1 },
          $push: {
            "metadata.analytics": {
              $each: [data],
              $slice: -1000, // Keep last 1000 entries
            },
          },
        },
      );
    } catch (error) {
      console.error("Failed to save analytics to MongoDB:", error);
    }
  }

  // Get analytics summary
  async getSummary(shortCode, days = 30) {
    const now = Date.now();
    const startTime = now - days * 24 * 60 * 60 * 1000;

    // Try Redis first
    const redisAnalytics = await redisClient.getAnalytics(
      shortCode,
      startTime,
      now,
    );

    if (redisAnalytics.length > 0) {
      return this.aggregateAnalytics(redisAnalytics);
    }

    // Fallback to MongoDB
    const url = await Url.findOne({ shortCode });
    if (!url) return null;

    return {
      totalClicks: url.clicks,
      clicksLast30Days: url.clicks, // Simplified
      uniqueVisitors: url.clicks, // Would need more sophisticated tracking
      popularReferrers: ["direct"],
      deviceDistribution: { desktop: 50, mobile: 50 },
      browserDistribution: { chrome: 60, firefox: 40 },
    };
  }

  // Real-time analytics
  async getRealtimeStats(shortCode) {
    const now = Date.now();
    const hourAgo = now - 60 * 60 * 1000;
    const dayAgo = now - 24 * 60 * 60 * 1000;

    const hourData = await redisClient.getAnalytics(shortCode, hourAgo, now);
    const dayData = await redisClient.getAnalytics(shortCode, dayAgo, now);

    return {
      clicksLastHour: hourData.length,
      clicksLast24Hours: dayData.length,
      currentHour: this.getHourlyBreakdown(hourData),
      topReferrers: this.getTopReferrers(dayData),
      devices: this.getDeviceBreakdown(dayData),
    };
  }

  // Helper methods
  getDeviceType(userAgent) {
    if (/mobile/i.test(userAgent)) return "mobile";
    if (/tablet/i.test(userAgent)) return "tablet";
    return "desktop";
  }

  getBrowserInfo(userAgent) {
    if (/chrome/i.test(userAgent)) return "chrome";
    if (/firefox/i.test(userAgent)) return "firefox";
    if (/safari/i.test(userAgent)) return "safari";
    if (/edge/i.test(userAgent)) return "edge";
    return "other";
  }

  aggregateAnalytics(data) {
    const summary = {
      total: data.length,
      devices: {},
      browsers: {},
      referrers: {},
      hourly: {},
    };

    data.forEach((item) => {
      const hour = new Date(item.timestamp).getHours();

      // Count devices
      summary.devices[item.device] = (summary.devices[item.device] || 0) + 1;

      // Count browsers
      summary.browsers[item.browser] =
        (summary.browsers[item.browser] || 0) + 1;

      // Count referrers
      summary.referrers[item.referrer] =
        (summary.referrers[item.referrer] || 0) + 1;

      // Count hourly
      summary.hourly[hour] = (summary.hourly[hour] || 0) + 1;
    });

    return summary;
  }

  getHourlyBreakdown(data) {
    const hourly = {};
    data.forEach((item) => {
      const hour = new Date(item.timestamp).getHours();
      hourly[hour] = (hourly[hour] || 0) + 1;
    });
    return hourly;
  }

  getTopReferrers(data, limit = 5) {
    const referrers = {};
    data.forEach((item) => {
      referrers[item.referrer] = (referrers[item.referrer] || 0) + 1;
    });

    return Object.entries(referrers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([referrer, count]) => ({ referrer, count }));
  }

  getDeviceBreakdown(data) {
    const devices = {};
    data.forEach((item) => {
      devices[item.device] = (devices[item.device] || 0) + 1;
    });
    return devices;
  }
}

module.exports = new AnalyticsService();
