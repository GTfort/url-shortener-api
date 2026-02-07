const QRCode = require("qrcode");

class QRCodeService {
  constructor() {
    this.defaultOptions = {
      errorCorrectionLevel: "H",
      type: "png",
      quality: 0.92,
      margin: 1,
      width: 300,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    };
  }

  // Generate QR code for URL
  async generateQRCode(url, options = {}) {
    try {
      const qrOptions = { ...this.defaultOptions, ...options };

      // Generate QR code as data URL
      const dataUrl = await QRCode.toDataURL(url, qrOptions);

      return {
        success: true,
        dataUrl,
        format: qrOptions.type,
        size: qrOptions.width,
        url,
      };
    } catch (error) {
      console.error("QR Code generation failed:", error);
      throw new Error("Failed to generate QR code");
    }
  }

  // Generate QR code with logo
  async generateQRCodeWithLogo(url, logoPath, options = {}) {
    try {
      // This would require additional setup
      // For now, returning basic QR code
      return await this.generateQRCode(url, options);
    } catch (error) {
      console.error("QR Code with logo generation failed:", error);
      throw error;
    }
  }

  // Generate QR code for download
  async generateQRCodeFile(url, format = "png") {
    try {
      const options = { ...this.defaultOptions, type: format };

      if (format === "svg") {
        const svgString = await QRCode.toString(url, { type: "svg" });
        return {
          success: true,
          content: svgString,
          format: "svg",
          mimeType: "image/svg+xml",
        };
      } else {
        const buffer = await QRCode.toBuffer(url, options);
        return {
          success: true,
          buffer,
          format,
          mimeType: `image/${format}`,
        };
      }
    } catch (error) {
      console.error("QR Code file generation failed:", error);
      throw error;
    }
  }

  // Generate multiple QR codes in different sizes
  async generateQRCodeVariants(url, sizes = [100, 200, 300]) {
    const variants = {};

    for (const size of sizes) {
      try {
        const dataUrl = await QRCode.toDataURL(url, {
          ...this.defaultOptions,
          width: size,
        });

        variants[size] = dataUrl;
      } catch (error) {
        console.error(`Failed to generate QR code size ${size}:`, error);
      }
    }

    return {
      success: Object.keys(variants).length > 0,
      variants,
      url,
    };
  }
}

module.exports = new QRCodeService();
