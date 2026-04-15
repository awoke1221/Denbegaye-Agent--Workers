"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptValue = encryptValue;
exports.decryptValue = decryptValue;
const crypto_js_1 = __importDefault(require("crypto-js"));
const secretKey = process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET ||
    "your-default-secret-please-change";
function encryptValue(value) {
    return crypto_js_1.default.AES.encrypt(value, secretKey).toString();
}
function decryptValue(cipher) {
    try {
        const bytes = crypto_js_1.default.AES.decrypt(cipher, secretKey);
        return bytes.toString(crypto_js_1.default.enc.Utf8);
    }
    catch {
        return "";
    }
}
