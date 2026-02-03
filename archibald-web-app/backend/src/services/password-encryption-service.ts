/**
 * Password Encryption Service
 *
 * Provides secure AES-256-GCM encryption/decryption for user passwords
 * stored in the database. This allows automatic password cache restoration
 * after backend restarts, improving UX without compromising security.
 *
 * Security Architecture:
 * - Algorithm: AES-256-GCM (NIST approved, FIPS 140-2 compliant)
 * - Key Derivation: PBKDF2-HMAC-SHA256 (100k iterations, OWASP recommended)
 * - Unique IV per encryption (prevents pattern analysis)
 * - Authentication tag for integrity verification (prevents tampering)
 * - Per-user encryption key (derived from JWT_SECRET + userId)
 *
 * Threat Model:
 * - Protects against: DB dump, backup leak, insider threat
 * - Does NOT protect against: VPS compromise with JWT_SECRET access
 * - Mitigations: Key rotation, VPS hardening, file permissions
 */

import crypto from "crypto";
import { logger } from "../logger";

const ENCRYPTION_CONFIG = {
  algorithm: "aes-256-gcm" as const,
  ivLength: 16, // 128 bits
  keyLength: 32, // 256 bits
  authTagLength: 16, // 128 bits
  keyDerivation: {
    algorithm: "pbkdf2",
    iterations: 100000, // OWASP recommended minimum
    digest: "sha256",
    saltSuffix: "archibald-salt-2026",
  },
  currentVersion: 1,
};

export interface EncryptedPassword {
  ciphertext: string; // Base64 encoded
  iv: string; // Base64 encoded
  authTag: string; // Base64 encoded
  version: number; // For future key rotation
}

export class PasswordEncryptionService {
  private jwtSecret: string;

  constructor(jwtSecret?: string) {
    this.jwtSecret =
      jwtSecret ||
      process.env.JWT_SECRET ||
      "dev-secret-key-change-in-production";

    if (this.jwtSecret === "dev-secret-key-change-in-production") {
      logger.warn(
        "⚠️  WARNING: Using default JWT_SECRET in production is INSECURE!",
      );
    }
  }

  /**
   * Encrypt a password using AES-256-GCM
   *
   * @param plaintext - Password in clear text
   * @param userId - User ID for key derivation (creates unique key per user)
   * @returns Encrypted password object with ciphertext, IV, and auth tag
   */
  encrypt(plaintext: string, userId: string): EncryptedPassword {
    try {
      // 1. Derive encryption key unique to this user
      const key = this.deriveKey(userId);

      // 2. Generate random IV (must be unique per encryption)
      const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);

      // 3. Create cipher with AES-256-GCM
      const cipher = crypto.createCipheriv(
        ENCRYPTION_CONFIG.algorithm,
        key,
        iv,
      );

      // 4. Encrypt the plaintext
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);

      // 5. Get authentication tag (for integrity verification)
      const authTag = cipher.getAuthTag();

      // 6. Return Base64-encoded data
      return {
        ciphertext: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        version: ENCRYPTION_CONFIG.currentVersion,
      };
    } catch (error) {
      logger.error("Password encryption failed", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Failed to encrypt password");
    }
  }

  /**
   * Decrypt a password using AES-256-GCM
   *
   * @param encrypted - Encrypted password object
   * @param userId - User ID for key derivation (must match encryption userId)
   * @returns Decrypted password in clear text
   * @throws Error if auth tag is invalid or decryption fails
   */
  decrypt(encrypted: EncryptedPassword, userId: string): string {
    try {
      // 1. Derive encryption key (same key used during encryption)
      const key = this.deriveKey(userId);

      // 2. Decode Base64 data
      const ciphertext = Buffer.from(encrypted.ciphertext, "base64");
      const iv = Buffer.from(encrypted.iv, "base64");
      const authTag = Buffer.from(encrypted.authTag, "base64");

      // 3. Create decipher with AES-256-GCM
      const decipher = crypto.createDecipheriv(
        ENCRYPTION_CONFIG.algorithm,
        key,
        iv,
      );

      // 4. Set authentication tag BEFORE calling decipher.update()
      decipher.setAuthTag(authTag);

      // 5. Decrypt (will throw if auth tag doesn't match)
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(), // Throws if auth tag verification fails
      ]);

      return decrypted.toString("utf8");
    } catch (error) {
      logger.error("Password decryption failed", {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error(
        "Failed to decrypt password - invalid auth tag or corrupted data",
      );
    }
  }

  /**
   * Derive encryption key from JWT_SECRET + userId using PBKDF2
   *
   * This creates a unique encryption key for each user, so even if two users
   * have the same password, their ciphertext will be completely different.
   *
   * @param userId - User ID to include in salt
   * @returns 256-bit encryption key
   */
  private deriveKey(userId: string): Buffer {
    // Create user-specific salt
    const salt = `${userId}-${ENCRYPTION_CONFIG.keyDerivation.saltSuffix}`;

    // Derive key using PBKDF2
    // - Computationally expensive (100k iterations)
    // - Deterministic (same inputs = same key)
    // - Unique per user (userId in salt)
    return crypto.pbkdf2Sync(
      this.jwtSecret, // Password/secret
      salt, // Salt (unique per user)
      ENCRYPTION_CONFIG.keyDerivation.iterations, // Iterations (100k)
      ENCRYPTION_CONFIG.keyLength, // Key length (32 bytes)
      ENCRYPTION_CONFIG.keyDerivation.digest, // Hash function (SHA256)
    );
  }

  /**
   * Rotate encryption key for all users
   *
   * Used when JWT_SECRET changes. Re-encrypts all passwords with new key.
   * Should be run as a maintenance task, not during normal operation.
   *
   * @param oldSecret - Previous JWT_SECRET
   * @param newSecret - New JWT_SECRET
   * @param getAllUsersCallback - Function to get all users with encrypted passwords
   * @param updateCallback - Function to update user's encrypted password
   * @returns Number of passwords successfully re-encrypted
   */
  async rotateAllKeys(
    oldSecret: string,
    newSecret: string,
    getAllUsersCallback: () => Array<{
      id: string;
      username: string;
      encrypted_password: string | null;
      encryption_iv: string | null;
      encryption_auth_tag: string | null;
      encryption_version: number | null;
    }>,
    updateCallback: (userId: string, encrypted: EncryptedPassword) => void,
  ): Promise<number> {
    logger.info("🔄 Starting encryption key rotation...");

    const users = getAllUsersCallback();
    let rotatedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      // Skip users without encrypted password
      if (
        !user.encrypted_password ||
        !user.encryption_iv ||
        !user.encryption_auth_tag
      ) {
        continue;
      }

      try {
        // 1. Decrypt with old key
        const oldService = new PasswordEncryptionService(oldSecret);
        const plaintext = oldService.decrypt(
          {
            ciphertext: user.encrypted_password,
            iv: user.encryption_iv,
            authTag: user.encryption_auth_tag,
            version: user.encryption_version || 1,
          },
          user.id,
        );

        // 2. Re-encrypt with new key
        const newService = new PasswordEncryptionService(newSecret);
        const reencrypted = newService.encrypt(plaintext, user.id);

        // 3. Update database
        updateCallback(user.id, reencrypted);

        rotatedCount++;
        logger.info(`✅ Rotated key for user: ${user.username}`);
      } catch (error) {
        errorCount++;
        logger.error(`❌ Failed to rotate key for user ${user.username}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    logger.info(
      `🎉 Key rotation complete: ${rotatedCount}/${users.length} successful, ${errorCount} errors`,
    );
    return rotatedCount;
  }
}

// Singleton instance
export const passwordEncryption = new PasswordEncryptionService();
