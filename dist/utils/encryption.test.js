"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const encryption_1 = require("./encryption");
(0, vitest_1.describe)("encryption utilities", () => {
    const testSecret = "test-secret-key-for-testing";
    const originalSecret = process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET;
    (0, vitest_1.beforeEach)(() => {
        // Set test secret
        process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET = testSecret;
    });
    (0, vitest_1.afterEach)(() => {
        // Restore original secret
        process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET = originalSecret;
    });
    (0, vitest_1.it)("encrypts and decrypts a string correctly", () => {
        const originalText = "sensitive-api-key-12345";
        const encrypted = (0, encryption_1.encryptValue)(originalText);
        const decrypted = (0, encryption_1.decryptValue)(encrypted);
        (0, vitest_1.expect)(encrypted).not.toBe(originalText);
        (0, vitest_1.expect)(decrypted).toBe(originalText);
    });
    (0, vitest_1.it)("encrypts and decrypts JSON data", () => {
        const originalData = { apiKey: "sk-12345", secret: "my-secret" };
        const jsonString = JSON.stringify(originalData);
        const encrypted = (0, encryption_1.encryptValue)(jsonString);
        const decrypted = (0, encryption_1.decryptValue)(encrypted);
        const parsedData = JSON.parse(decrypted);
        (0, vitest_1.expect)(encrypted).not.toBe(jsonString);
        (0, vitest_1.expect)(parsedData).toEqual(originalData);
    });
    (0, vitest_1.it)("produces different encrypted values for same input", () => {
        const input = "same-input";
        const encrypted1 = (0, encryption_1.encryptValue)(input);
        const encrypted2 = (0, encryption_1.encryptValue)(input);
        // AES encryption with same key should produce different ciphertexts
        // (due to random IV), but they should decrypt to the same value
        (0, vitest_1.expect)(encrypted1).not.toBe(encrypted2);
        (0, vitest_1.expect)((0, encryption_1.decryptValue)(encrypted1)).toBe(input);
        (0, vitest_1.expect)((0, encryption_1.decryptValue)(encrypted2)).toBe(input);
    });
    (0, vitest_1.it)("handles empty strings", () => {
        const encrypted = (0, encryption_1.encryptValue)("");
        const decrypted = (0, encryption_1.decryptValue)(encrypted);
        (0, vitest_1.expect)(decrypted).toBe("");
    });
    (0, vitest_1.it)("handles special characters", () => {
        const input = "special!@#$%^&*()_+{}|:<>?[]\\;',./";
        const encrypted = (0, encryption_1.encryptValue)(input);
        const decrypted = (0, encryption_1.decryptValue)(input);
        (0, vitest_1.expect)((0, encryption_1.decryptValue)(encrypted)).toBe(input);
    });
    (0, vitest_1.it)("returns empty string for invalid encrypted data", () => {
        const invalidCipher = "invalid-encrypted-data";
        const result = (0, encryption_1.decryptValue)(invalidCipher);
        (0, vitest_1.expect)(result).toBe("");
    });
    (0, vitest_1.it)("uses default secret when env var is not set", () => {
        delete process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET;
        const input = "test-data";
        const encrypted = (0, encryption_1.encryptValue)(input);
        const decrypted = (0, encryption_1.decryptValue)(encrypted);
        (0, vitest_1.expect)(decrypted).toBe(input);
    });
});
