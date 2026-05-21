import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "crypto";

/**
 * Production-grade encryption service using Node.js native crypto module
 * Implements AES-256-GCM with authentication tag for tamper detection
 * Encryption format: iv:authTag:encryptedData (all hex encoded)
 */

// Validate encryption key on module load
function validateEncryptionKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;

  if (!keyHex) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is not set. " +
        "Run 'npm run generate-key' to generate a secure key.",
    );
  }

  if (!/^[0-9a-f]{64}$/i.test(keyHex)) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hexadecimal string (32 bytes). " +
        "Run 'npm run generate-key' to generate a valid key.",
    );
  }

  return Buffer.from(keyHex, "hex");
}

let encryptionKey: Buffer;

// Initialize key on module load
try {
  encryptionKey = validateEncryptionKey();
} catch (error) {
  console.error("❌ Encryption Service Initialization Failed:", error);
  process.exit(1);
}

/**
 * Encrypts a value using AES-256-GCM
 * @param value - The plaintext value to encrypt
 * @returns Encrypted value in format: iv:authTag:encryptedData (all hex encoded)
 * @throws Error if encryption fails
 */
export function encryptValue(value: string): string {
  try {
    const iv = randomBytes(12); // 96-bit IV for GCM mode (recommended)
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);

    let encrypted = cipher.update(value, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData (all hex encoded for easy storage/transmission)
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Decrypts a value encrypted with encryptValue()
 * Verifies authentication tag to ensure data integrity
 * @param cipher - Encrypted value in format: iv:authTag:encryptedData
 * @returns Decrypted plaintext value
 * @throws Error if decryption fails or auth tag verification fails (tampering detected)
 */
export function decryptValue(cipher: string): string {
  try {
    const parts = cipher.split(":");

    if (parts.length !== 3) {
      throw new Error(
        "Invalid cipher format. Expected: iv:authTag:encryptedData",
      );
    }

    const [ivHex, authTagHex, encryptedData] = parts;

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    if (iv.length !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes, got ${iv.length}`);
    }

    if (authTag.length !== 16) {
      throw new Error(
        `Invalid auth tag length: expected 16 bytes, got ${authTag.length}`,
      );
    }

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Generates a secure random encryption key (32 bytes = 256 bits)
 * Intended for use during setup/deployment, not in production runtime
 * @returns 64-character hexadecimal string representing the encryption key
 */
export function generateEncryptionKey(): string {
  const key = randomBytes(32); // 256 bits for AES-256
  return key.toString("hex");
}

/**
 * Re-encrypts a value encrypted with an old key using the current key
 * Useful for key rotation without data loss
 * @param oldCipher - Cipher encrypted with the old key
 * @param oldKeyHex - The old encryption key as 64-char hex string
 * @returns New cipher encrypted with the current key
 * @throws Error if decryption with old key fails or re-encryption fails
 */
export function rotateEncryptedValue(
  oldCipher: string,
  oldKeyHex: string,
): string {
  try {
    // Validate old key format
    if (!/^[0-9a-f]{64}$/i.test(oldKeyHex)) {
      throw new Error(
        "Invalid old key format. Must be a 64-character hexadecimal string.",
      );
    }

    const oldKey = Buffer.from(oldKeyHex, "hex");

    // Decrypt with old key
    const parts = oldCipher.split(":");
    if (parts.length !== 3) {
      throw new Error(
        "Invalid cipher format. Expected: iv:authTag:encryptedData",
      );
    }

    const [ivHex, authTagHex, encryptedData] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv("aes-256-gcm", oldKey, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encryptedData, "hex", "utf8");
    plaintext += decipher.final("utf8");

    // Re-encrypt with current key
    return encryptValue(plaintext);
  } catch (error) {
    throw new Error(
      `Key rotation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Encryption service with all encryption/decryption operations
 * Use this for clean, organized imports: EncryptionService.encryptValue()
 */
export const EncryptionService = {
  encryptValue,
  decryptValue,
  generateEncryptionKey,
  rotateEncryptedValue,
};

// Default export for backward compatibility
export default EncryptionService;
