import CryptoJS from "crypto-js";

const secretKey =
  process.env.NEXT_PUBLIC_AGENT_BUILDER_SECRET ||
  "your-default-secret-please-change";

export function encryptValue(value: string) {
  return CryptoJS.AES.encrypt(value, secretKey).toString();
}

export function decryptValue(cipher: string) {
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, secretKey);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}
