"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeApiKey = storeApiKey;
exports.getApiKey = getApiKey;
exports.rotateApiKey = rotateApiKey;
const supabaseClient_1 = require("./supabaseClient");
const encryption_1 = require("./encryption");
const logger_1 = require("./logger");
async function storeApiKey(userId, provider, plainKey, description) {
    try {
        const encrypted = (0, encryption_1.encryptValue)(plainKey);
        const { data, error } = await supabaseClient_1.supabase
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
            logger_1.logger.error("Failed to store API key in vault", { error });
            throw error;
        }
        return data?.id;
    }
    catch (err) {
        logger_1.logger.error("storeApiKey error", { err });
        throw err;
    }
}
async function getApiKey(userId, provider) {
    try {
        const { data, error } = await supabaseClient_1.supabase
            .from("api_keys_vault")
            .select("id, encrypted_key, last_used")
            .eq("user_id", userId)
            .eq("provider", provider)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();
        if (error || !data) {
            logger_1.logger.debug("No API key found in vault", { userId, provider, error });
            return null;
        }
        try {
            const decrypted = (0, encryption_1.decryptValue)(data.encrypted_key);
            // update last_used timestamp
            await supabaseClient_1.supabase
                .from("api_keys_vault")
                .update({ last_used: new Date().toISOString() })
                .eq("id", data.id);
            return decrypted;
        }
        catch (decryptionError) {
            logger_1.logger.error("Failed to decrypt API key from vault", { decryptionError });
            return null;
        }
    }
    catch (err) {
        logger_1.logger.error("getApiKey error", { err });
        return null;
    }
}
async function rotateApiKey(userId, provider, newPlainKey) {
    try {
        const encrypted = (0, encryption_1.encryptValue)(newPlainKey);
        const { data, error } = await supabaseClient_1.supabase
            .from("api_keys_vault")
            .insert({ user_id: userId, provider, encrypted_key: encrypted })
            .select("id");
        if (error) {
            logger_1.logger.error("Failed to insert rotated API key", { error });
            throw error;
        }
        // Optionally mark previous keys as deprecated; keep history for audit
        await supabaseClient_1.supabase
            .from("api_keys_vault")
            .update({ description: "deprecated" })
            .neq("id", data?.[0]?.id)
            .eq("user_id", userId)
            .eq("provider", provider);
        return data?.[0]?.id;
    }
    catch (err) {
        logger_1.logger.error("rotateApiKey error", { err });
        throw err;
    }
}
