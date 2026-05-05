import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { encryptValue, decryptValue } from "./encryption";

describe("encryption utilities", () => {
  const testSecret = "test-secret-key-for-testing";
  const originalSecret = process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET;

  beforeEach(() => {
    // Set test secret
    process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET = testSecret;
  });

  afterEach(() => {
    // Restore original secret
    process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET = originalSecret;
  });

  it("encrypts and decrypts a string correctly", () => {
    const originalText = "sensitive-api-key-12345";
    const encrypted = encryptValue(originalText);
    const decrypted = decryptValue(encrypted);

    expect(encrypted).not.toBe(originalText);
    expect(decrypted).toBe(originalText);
  });

  it("encrypts and decrypts JSON data", () => {
    const originalData = { apiKey: "sk-12345", secret: "my-secret" };
    const jsonString = JSON.stringify(originalData);
    const encrypted = encryptValue(jsonString);
    const decrypted = decryptValue(encrypted);
    const parsedData = JSON.parse(decrypted);

    expect(encrypted).not.toBe(jsonString);
    expect(parsedData).toEqual(originalData);
  });

  it("produces different encrypted values for same input", () => {
    const input = "same-input";
    const encrypted1 = encryptValue(input);
    const encrypted2 = encryptValue(input);

    // AES encryption with same key should produce different ciphertexts
    // (due to random IV), but they should decrypt to the same value
    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptValue(encrypted1)).toBe(input);
    expect(decryptValue(encrypted2)).toBe(input);
  });

  it("handles empty strings", () => {
    const encrypted = encryptValue("");
    const decrypted = decryptValue(encrypted);

    expect(decrypted).toBe("");
  });

  it("handles special characters", () => {
    const input = "special!@#$%^&*()_+{}|:<>?[]\\;',./";
    const encrypted = encryptValue(input);
    const decrypted = decryptValue(input);

    expect(decryptValue(encrypted)).toBe(input);
  });

  it("returns empty string for invalid encrypted data", () => {
    const invalidCipher = "invalid-encrypted-data";
    const result = decryptValue(invalidCipher);

    expect(result).toBe("");
  });

  it("uses default secret when env var is not set", () => {
    delete process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET;

    const input = "test-data";
    const encrypted = encryptValue(input);
    const decrypted = decryptValue(encrypted);

    expect(decrypted).toBe(input);
  });
});
