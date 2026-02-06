const { nanoid } = require('nanoid');

// Generate short code (6 characters)
const generateShortCode = () => nanoid(6);

// Validate URL format
const isValidUrl = (url) => {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
};

module.exports = {
    generateShortCode,
    isValidUrl
};
