#!/usr/bin/env node

/**
 * Encryption Key Generation Script
 *
 * This script generates a secure random encryption key for AES-256-GCM encryption.
 * Run this script once during initial setup or when rotating encryption keys.
 *
 * Usage:
 *   npm run generate-key
 *
 * The generated key should be added to your .env file as:
 *   ENCRYPTION_KEY=<generated-key>
 */

import { randomBytes } from "crypto";

/**
 * Generate a secure random 256-bit encryption key
 * @returns 64-character hexadecimal string representing 32 bytes
 */
function generateEncryptionKey(): string {
  const key = randomBytes(32); // 256 bits for AES-256
  return key.toString("hex");
}

// Generate and display the key
const newKey = generateEncryptionKey();

console.log("\n");
console.log(
  "╔════════════════════════════════════════════════════════════════╗",
);
console.log(
  "║              🔐 Encryption Key Generated Successfully          ║",
);
console.log(
  "╚════════════════════════════════════════════════════════════════╝",
);
console.log("\n");
console.log("📋 Generated Encryption Key (AES-256-GCM):");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`\n${newKey}\n`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("\n");

console.log("📝 Add this to your .env file:\n");
console.log(`ENCRYPTION_KEY=${newKey}`);
console.log("\n");

console.log("⚠️  IMPORTANT SECURITY NOTES:");
console.log(
  "   • Keep this key secure and do not commit it to version control",
);
console.log(
  "   • Store the key in a secure secrets management system (e.g., AWS Secrets Manager)",
);
console.log("   • In production, use environment variables or a vault service");
console.log("   • Never share this key or log it in debug output");
console.log(
  "   • If the key is compromised, regenerate it and re-encrypt all stored credentials",
);
console.log("\n");

console.log("🔄 Key Rotation:");
console.log(
  "   • When rotating to a new key, use EncryptionService.rotateEncryptedValue()",
);
console.log(
  "   • This allows decryption with the old key and re-encryption with the new key",
);
console.log(
  "   • Update ENCRYPTION_KEY in your environment after running rotation",
);
console.log("\n");

process.exit(0);
