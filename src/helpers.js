const { nanoid } = require("nanoid");
const crypto = require("crypto");

// Generate short code with custom length
const generateShortCode = (length = 6) => nanoid(length);

// Validate URL format
const isValidUrl = (url) => {
  try {
    const urlObj = new URL(url);
    return ["http:", "https:"].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

// Generate secure random string
const generateSecureString = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

// Validate short code format (alphanumeric, dash, underscore)
const isValidShortCode = (code) => {
  return /^[a-zA-Z0-9_-]{4,20}$/.test(code);
};

// Sanitize URL
const sanitizeUrl = (url) => {
  try {
    const urlObj = new URL(url);

    // Remove tracking parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "msclkid",
    ];

    trackingParams.forEach((param) => {
      urlObj.searchParams.delete(param);
    });

    return urlObj.toString();
  } catch {
    return url;
  }
};

// Calculate expiration date
const calculateExpiration = (days = 30) => {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

// Format analytics data
const formatAnalytics = (analyticsArray) => {
  return analyticsArray.reduce((acc, curr) => {
    const date = new Date(curr.timestamp).toISOString().split("T")[0];
    if (!acc[date]) acc[date] = 0;
    acc[date] += 1;
    return acc;
  }, {});
};

module.exports = {
  generateShortCode,
  isValidUrl,
  generateSecureString,
  isValidShortCode,
  sanitizeUrl,
  calculateExpiration,
  formatAnalytics,
};
