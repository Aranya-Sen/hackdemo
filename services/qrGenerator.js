const QRCode = require('qrcode');
const fs = require('fs').promises;
const path = require('path');

class QRCodeService {
  constructor() {
    this.qrDirectory = './public/qr';
  }

  // Ensure QR directory exists
  async ensureQRDirectory() {
    try {
      await fs.access(this.qrDirectory);
    } catch {
      await fs.mkdir(this.qrDirectory, { recursive: true });
    }
  }

  // Generate QR Code with specifications for printing
  async generateQRCode(unique_id, item_url) {
    try {
      await this.ensureQRDirectory();

      // QR Code options with high contrast and error correction
      const qrOptions = {
        errorCorrectionLevel: 'M', // Medium error correction
        type: 'png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',  // High contrast black
          light: '#FFFFFF'  // High contrast white
        },
        width: 300, // Minimum 300px for 30mm at 300 DPI printing
        height: 300
      };

      // Generate PNG QR Code
      const qrCodeBuffer = await QRCode.toBuffer(item_url, qrOptions);
      const qrCodePath = path.join(this.qrDirectory, `${unique_id}.png`);
      await fs.writeFile(qrCodePath, qrCodeBuffer);

      // Generate SVG QR Code for scalability
      const svgOptions = {
        errorCorrectionLevel: 'M',
        type: 'svg',
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      };

      const svgString = await QRCode.toString(item_url, svgOptions);

      return {
        qrCodePath: `/qr/${unique_id}.png`,
        svgData: svgString,
        fullPath: qrCodePath
      };
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error(`QR Code generation failed: ${error.message}`);
    }
  }

  // Generate QR codes in bulk for existing items
  async generateBulkQRCodes(items) {
    const results = {
      success: [],
      failed: [],
      total: items.length
    };

    await this.ensureQRDirectory();

    for (const item of items) {
      try {
        const qrResult = await this.generateQRCode(item.unique_id, item.item_url);
        results.success.push({
          unique_id: item.unique_id,
          qr_path: qrResult.qrCodePath
        });
      } catch (error) {
        console.error(`Failed to generate QR for ${item.unique_id}:`, error);
        results.failed.push({
          unique_id: item.unique_id,
          error: error.message
        });
      }
    }

    return results;
  }

  // Delete QR code files
  async deleteQRCode(unique_id) {
    try {
      const pngPath = path.join(this.qrDirectory, `${unique_id}.png`);
      await fs.unlink(pngPath);
      return true;
    } catch (error) {
      console.error(`Failed to delete QR code for ${unique_id}:`, error);
      return false;
    }
  }

  // Get QR code file path
  getQRCodePath(unique_id) {
    return `/qr/${unique_id}.png`;
  }

  // Validate QR code exists
  async qrCodeExists(unique_id) {
    try {
      const qrPath = path.join(this.qrDirectory, `${unique_id}.png`);
      await fs.access(qrPath);
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new QRCodeService();