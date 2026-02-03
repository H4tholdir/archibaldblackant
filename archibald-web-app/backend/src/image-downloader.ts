/**
 * Image Downloader for Product Images
 *
 * Features:
 * - Download images from Archibald BinaryDataHttpHandler
 * - Save with product name as filename
 * - Retry logic with exponential backoff
 * - Image metadata extraction (dimensions, mime type)
 * - Duplicate detection via hash
 */

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { logger } from "./logger";
import type { Page } from "puppeteer";

export interface ImageDownloadResult {
  success: boolean;
  localPath?: string;
  fileSize?: number;
  mimeType?: string;
  hash?: string;
  width?: number;
  height?: number;
  error?: string;
}

export interface ImageDownloadOptions {
  maxRetries?: number;
  retryDelay?: number;
  timeout?: number;
  imageDir?: string;
}

export class ImageDownloader {
  private imageDir: string;
  private maxRetries: number;
  private retryDelay: number;
  private timeout: number;

  constructor(options: ImageDownloadOptions = {}) {
    this.imageDir =
      options.imageDir || path.join(__dirname, "../data/product-images");
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;

    // Ensure image directory exists
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
      logger.info(`Created image directory: ${this.imageDir}`);
    }
  }

  /**
   * Download image from Archibald using authenticated page session
   *
   * @param imageUrl - Full URL to image (e.g., /Archibald/DXX.axd?handlerName=BinaryDataHttpHandler...)
   * @param productName - Product name for filename (e.g., "ENGO03.000")
   * @param page - Puppeteer page with active session
   * @returns Download result with metadata
   */
  async downloadImage(
    imageUrl: string,
    productName: string,
    page: Page,
  ): Promise<ImageDownloadResult> {
    // Sanitize product name for filename
    const sanitizedName = this.sanitizeFilename(productName);
    const localPath = path.join(this.imageDir, `${sanitizedName}.jpg`);
    const relativePath = `images/${sanitizedName}.jpg`;

    // Skip if already exists
    if (fs.existsSync(localPath)) {
      logger.debug(`Image already exists: ${relativePath}`);
      return {
        success: true,
        localPath: relativePath,
        ...this.getImageMetadata(localPath),
      };
    }

    // Retry logic
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.debug(
          `Downloading image (attempt ${attempt}/${this.maxRetries}): ${imageUrl}`,
        );

        // Ensure URL is absolute
        const fullUrl = imageUrl.startsWith("http")
          ? imageUrl
          : `${process.env.ARCHIBALD_URL}${imageUrl}`;

        // Download using authenticated page session
        const response = await page.goto(fullUrl, {
          waitUntil: "networkidle2",
          timeout: this.timeout,
        });

        if (!response || !response.ok()) {
          throw new Error(
            `HTTP ${response?.status() || "error"}: Failed to download image`,
          );
        }

        const buffer = await response.buffer();

        if (buffer.length === 0) {
          throw new Error("Downloaded image is empty");
        }

        // Validate it's an image
        const mimeType = response.headers()["content-type"] || "image/jpeg";
        if (!mimeType.startsWith("image/")) {
          throw new Error(`Invalid content type: ${mimeType}`);
        }

        // Save to disk
        fs.writeFileSync(localPath, buffer);
        logger.info(
          `✅ Downloaded image: ${relativePath} (${buffer.length} bytes)`,
        );

        // Extract metadata
        const metadata = this.getImageMetadata(localPath);

        return {
          success: true,
          localPath: relativePath,
          fileSize: buffer.length,
          mimeType,
          ...metadata,
        };
      } catch (error: any) {
        logger.warn(
          `Failed to download image (attempt ${attempt}/${this.maxRetries}): ${error.message}`,
        );

        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Final attempt failed
          return {
            success: false,
            error: error.message,
          };
        }
      }
    }

    return {
      success: false,
      error: "Max retries exceeded",
    };
  }

  /**
   * Download multiple images in batch
   *
   * @param images - Array of {imageUrl, productName}
   * @param page - Puppeteer page
   * @param onProgress - Progress callback
   * @returns Results for each image
   */
  async downloadBatch(
    images: Array<{ imageUrl: string; productName: string }>,
    page: Page,
    onProgress?: (current: number, total: number) => void,
  ): Promise<ImageDownloadResult[]> {
    const results: ImageDownloadResult[] = [];

    for (let i = 0; i < images.length; i++) {
      const { imageUrl, productName } = images[i];

      const result = await this.downloadImage(imageUrl, productName, page);
      results.push(result);

      if (onProgress) {
        onProgress(i + 1, images.length);
      }

      // Small delay between downloads to avoid rate limiting
      if (i < images.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Get image metadata (dimensions, hash)
   */
  private getImageMetadata(filePath: string): {
    hash: string;
    width?: number;
    height?: number;
  } {
    try {
      const buffer = fs.readFileSync(filePath);

      // Calculate SHA256 hash
      const hash = createHash("sha256").update(buffer).digest("hex");

      // Try to extract dimensions (basic JPEG/PNG parsing)
      const dimensions = this.extractImageDimensions(buffer);

      return {
        hash,
        ...dimensions,
      };
    } catch (error) {
      logger.warn(`Failed to extract image metadata: ${error}`);
      return {
        hash: "",
      };
    }
  }

  /**
   * Extract image dimensions from buffer (basic implementation)
   * Supports JPEG and PNG formats
   */
  private extractImageDimensions(buffer: Buffer): {
    width?: number;
    height?: number;
  } {
    try {
      // Check for JPEG
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        return this.extractJpegDimensions(buffer);
      }

      // Check for PNG
      if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47
      ) {
        return this.extractPngDimensions(buffer);
      }

      return {};
    } catch (error) {
      return {};
    }
  }

  /**
   * Extract JPEG dimensions
   */
  private extractJpegDimensions(buffer: Buffer): {
    width?: number;
    height?: number;
  } {
    let offset = 2;

    while (offset < buffer.length) {
      // Check for SOF (Start of Frame) marker
      if (buffer[offset] === 0xff) {
        const marker = buffer[offset + 1];

        // SOF0-SOF3 markers contain dimension info
        if (
          marker >= 0xc0 &&
          marker <= 0xc3 &&
          marker !== 0xc4 &&
          marker !== 0xc8
        ) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }

        // Skip to next marker
        const segmentLength = buffer.readUInt16BE(offset + 2);
        offset += segmentLength + 2;
      } else {
        offset++;
      }
    }

    return {};
  }

  /**
   * Extract PNG dimensions
   */
  private extractPngDimensions(buffer: Buffer): {
    width?: number;
    height?: number;
  } {
    // PNG dimensions are in IHDR chunk at bytes 16-23
    if (buffer.length >= 24) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    return {};
  }

  /**
   * Sanitize filename (remove invalid characters)
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/_{2,}/g, "_")
      .substring(0, 255);
  }

  /**
   * Get image directory path
   */
  getImageDir(): string {
    return this.imageDir;
  }

  /**
   * Clean up old images not in the provided product list
   */
  cleanupUnusedImages(currentProductNames: Set<string>): number {
    try {
      const files = fs.readdirSync(this.imageDir);
      let deletedCount = 0;

      for (const file of files) {
        // Extract product name from filename (remove extension)
        const productName = file.replace(/\.[^.]+$/, "");

        if (!currentProductNames.has(productName)) {
          const filePath = path.join(this.imageDir, file);
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.debug(`Deleted unused image: ${file}`);
        }
      }

      if (deletedCount > 0) {
        logger.info(`🗑️  Cleaned up ${deletedCount} unused images`);
      }

      return deletedCount;
    } catch (error) {
      logger.warn(`Failed to cleanup unused images: ${error}`);
      return 0;
    }
  }
}
