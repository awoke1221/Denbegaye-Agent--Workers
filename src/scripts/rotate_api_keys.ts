import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createDecipheriv, createCipheriv } from "crypto";

// Load env from .env.local or .env
const envPath = process.env.NODE_ENV === "production" ? ".env" : ".env.local";
dotenv.config({ path: envPath });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_KEY = process.env.OLD_ENCRYPTION_KEY;
const NEW_KEY = process.env.NEW_ENCRYPTION_KEY;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment",
  );
  process.exit(1);
}
if (!OLD_KEY || !NEW_KEY) {
  console.error(
    "OLD_ENCRYPTION_KEY and NEW_ENCRYPTION_KEY must be set in environment",
  );
  process.exit(1);
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY as string,
);

function decryptWithKey(cipherText: string, keyHex: string): string {
  const parts = cipherText.split(":");
  if (parts.length !== 3) throw new Error("Invalid cipher format");
  const iv = Buffer.from(parts[0], "hex");
  const authTag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptWithKey(plainText: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = Buffer.from(cryptoRandom(12));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

function cryptoRandom(n: number) {
  return require("crypto").randomBytes(n);
}

async function rotateAllKeys() {
  try {
    console.log("Fetching API keys from vault...");
    const { data, error } = await supabase
      .from("api_keys_vault")
      .select("id, user_id, provider, encrypted_key");
    if (error) {
      console.error("Failed to fetch api keys:", error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log("No API keys found to rotate.");
      return;
    }

    for (const row of data) {
      try {
        const plain = decryptWithKey(row.encrypted_key, OLD_KEY as string);
        const newEncrypted = encryptWithKey(plain, NEW_KEY as string);
        console.log(
          `Rotating key id=${row.id} provider=${row.provider} user=${row.user_id}`,
        );
        if (!DRY_RUN) {
          const { error: updateErr } = await supabase
            .from("api_keys_vault")
            .update({
              encrypted_key: newEncrypted,
              last_used: new Date().toISOString(),
            })
            .eq("id", row.id);
          if (updateErr) {
            console.error("Failed to update rotated key:", updateErr);
          }
        }
      } catch (e) {
        console.error(`Failed to rotate key id=${row.id}:`, e);
      }
    }

    console.log("Rotation complete.");
  } catch (err) {
    console.error("Rotation failed:", err);
    process.exit(1);
  }
}

rotateAllKeys().then(() => process.exit(0));
