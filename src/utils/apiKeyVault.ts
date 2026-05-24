import { supabase } from "./supabaseClient";
import { encryptValue, decryptValue } from "./encryption";
import { logger } from "./logger";

export interface StoredKey {
  id: string;
  user_id: string;
  provider: string;
  encrypted_key: string;
  description?: string;
  created_at?: string;
  last_used?: string;
}

export async function storeApiKey(
  userId: string,
  provider: string,
  plainKey: string,
  description?: string,
) {
  try {
    const encrypted = encryptValue(plainKey);
    const { data, error } = await supabase
      .from("api_keys_vault")
      .insert({
        user_id: userId,
        provider,
        encrypted_key: encrypted,
        description,
      })
      .select("id")
      .single();

    if (error) {
      logger.error("Failed to store API key in vault", { error });
      throw error;
    }

    return data?.id;
  } catch (err) {
    logger.error("storeApiKey error", { err });
    throw err;
  }
}

export async function getApiKey(
  userId: string,
  provider: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("api_keys_vault")
      .select("id, encrypted_key, last_used")
      .eq("user_id", userId)
      .eq("provider", provider)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      logger.debug("No API key found in vault", { userId, provider, error });
      return null;
    }

    try {
      const decrypted = decryptValue(data.encrypted_key);
      // update last_used timestamp
      await supabase
        .from("api_keys_vault")
        .update({ last_used: new Date().toISOString() })
        .eq("id", data.id);

      return decrypted;
    } catch (decryptionError) {
      logger.error("Failed to decrypt API key from vault", { decryptionError });
      return null;
    }
  } catch (err) {
    logger.error("getApiKey error", { err });
    return null;
  }
}

export async function rotateApiKey(
  userId: string,
  provider: string,
  newPlainKey: string,
) {
  try {
    const encrypted = encryptValue(newPlainKey);
    const { data, error } = await supabase
      .from("api_keys_vault")
      .insert({ user_id: userId, provider, encrypted_key: encrypted })
      .select("id");

    if (error) {
      logger.error("Failed to insert rotated API key", { error });
      throw error;
    }

    // Optionally mark previous keys as deprecated; keep history for audit
    await supabase
      .from("api_keys_vault")
      .update({ description: "deprecated" })
      .neq("id", data?.id)
      .eq("user_id", userId)
      .eq("provider", provider);

    return data?.id;
  } catch (err) {
    logger.error("rotateApiKey error", { err });
    throw err;
  }
}
