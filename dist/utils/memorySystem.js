"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextMemory = exports.SupabaseMemorySystem = void 0;
const supabaseClient_1 = require("./supabaseClient");
// Simple embedding function - in production, use an external embedding model (OpenAI/VertexAI)
async function generateEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0);
    words.forEach((word, index) => {
        const hash = word
            .split("")
            .reduce((acc, char) => acc + char.charCodeAt(0), 0);
        embedding[index % embedding.length] =
            (embedding[index % embedding.length] + hash) % 1000;
    });
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / (magnitude || 1));
}
function cosineSimilarity(a, b) {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB || 1);
}
class SupabaseMemorySystem {
    constructor() {
        this.tableName = "memories";
    }
    async store(memory) {
        const memoryId = `mem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        const { error } = await supabaseClient_1.supabase.from(this.tableName).insert([
            {
                id: memoryId,
                content: memory.content,
                embedding: memory.embedding,
                metadata: { ...memory.metadata, scope: memory.scope },
                timestamp: new Date().toISOString(),
                created_at: new Date().toISOString(),
            },
        ]);
        if (error) {
            throw new Error(`Supabase memory store failed: ${error.message}`);
        }
        return memoryId;
    }
    async retrieve(query, limit, scope) {
        const queryEmbedding = await generateEmbedding(query);
        const { data, error } = await supabaseClient_1.supabase
            .from(this.tableName)
            .select("*")
            .contains("metadata", { scope })
            .order("timestamp", { ascending: false })
            .limit(100);
        if (error) {
            console.error("Supabase retrieve error:", error);
            return [];
        }
        const memories = (data || []).map((item) => ({
            id: item.id,
            content: item.content,
            embedding: item.embedding,
            metadata: item.metadata,
            timestamp: new Date(item.timestamp),
            scope: item.metadata?.scope || "default",
            similarity: 0,
        }));
        memories.forEach((mem) => {
            if (mem.embedding) {
                mem.similarity = cosineSimilarity(queryEmbedding, mem.embedding);
            }
            else {
                mem.similarity = 0;
            }
        });
        return memories
            .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
            .slice(0, limit || 10);
    }
    async update(memoryId, content, metadata) {
        try {
            const embedding = await generateEmbedding(content);
            const { error } = await supabaseClient_1.supabase
                .from(this.tableName)
                .update({
                content,
                embedding,
                metadata,
                timestamp: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
                .eq("id", memoryId);
            if (error) {
                console.error("Supabase update error:", error);
                return false;
            }
            return true;
        }
        catch {
            return false;
        }
    }
    async delete(memoryId) {
        const { error } = await supabaseClient_1.supabase
            .from(this.tableName)
            .delete()
            .eq("id", memoryId);
        if (error) {
            console.error("Supabase delete error:", error);
            return false;
        }
        return true;
    }
    async searchSimilar(embedding, limit, scope) {
        let query = supabaseClient_1.supabase.from(this.tableName).select("*");
        if (scope) {
            query = query.contains("metadata", { scope });
        }
        query = query.limit(limit || 50);
        const { data, error } = await query;
        if (error) {
            console.error("Supabase searchSimilar error:", error);
            return [];
        }
        const similar = (data || []).map((item) => {
            const dbMem = {
                id: item.id,
                content: item.content,
                embedding: item.embedding,
                metadata: item.metadata,
                timestamp: new Date(item.timestamp),
                scope: item.metadata?.scope || "default",
                similarity: item.embedding
                    ? cosineSimilarity(embedding, item.embedding)
                    : 0,
            };
            return dbMem;
        });
        return similar
            .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
            .slice(0, limit || 10);
    }
    async getMemoryById(memoryId) {
        const { data, error } = await supabaseClient_1.supabase
            .from(this.tableName)
            .select("*")
            .eq("id", memoryId)
            .single();
        if (error) {
            console.error("Supabase getMemoryById error:", error);
            return null;
        }
        if (!data)
            return null;
        return {
            id: data.id,
            content: data.content,
            embedding: data.embedding || [],
            metadata: data.metadata,
            timestamp: new Date(data.timestamp),
            scope: data.metadata?.scope || "default",
        };
    }
    async getMemoriesByScope(scope, limitCount = 20) {
        const { data, error } = await supabaseClient_1.supabase
            .from(this.tableName)
            .select("*")
            .contains("metadata", { scope })
            .order("timestamp", { ascending: false })
            .limit(limitCount);
        if (error) {
            console.error("Supabase getMemoriesByScope error:", error);
            return [];
        }
        return (data || []).map((item) => ({
            id: item.id,
            content: item.content,
            embedding: item.embedding || [] || [],
            metadata: item.metadata,
            timestamp: new Date(item.timestamp),
            scope: item.metadata?.scope || "default",
        }));
    }
    async cleanupOldMemories(scope, daysOld = 30) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);
        const { data, error } = await supabaseClient_1.supabase
            .from(this.tableName)
            .select("id")
            .contains("metadata", { scope })
            .lte("timestamp", cutoffDate.toISOString());
        if (error) {
            console.error("Supabase cleanupOldMemories error:", error);
            return 0;
        }
        if (!data || data.length === 0) {
            return 0;
        }
        const ids = data.map((item) => item.id);
        const { error: deleteError } = await supabaseClient_1.supabase
            .from(this.tableName)
            .delete()
            .in("id", ids);
        if (deleteError) {
            console.error("Supabase cleanupOldMemories delete error:", deleteError);
            return 0;
        }
        return ids.length;
    }
    async getMemoryStats(scope) {
        let query = supabaseClient_1.supabase.from(this.tableName).select("*");
        if (scope) {
            query = query.contains("metadata", { scope });
        }
        const { data, error } = await query;
        if (error) {
            console.error("Supabase getMemoryStats error:", error);
            return {
                totalMemories: 0,
                averageSimilarity: 0,
                oldestMemory: null,
                newestMemory: null,
            };
        }
        const memories = (data || []).map((item) => ({
            id: item.id,
            content: item.content,
            embedding: item.embedding,
            metadata: item.metadata,
            timestamp: new Date(item.timestamp),
        }));
        if (memories.length === 0) {
            return {
                totalMemories: 0,
                averageSimilarity: 0,
                oldestMemory: null,
                newestMemory: null,
            };
        }
        // Note: similarity calculation not implemented yet
        const averageSimilarity = 0;
        const oldestMemory = new Date(Math.min(...memories.map((mem) => mem.timestamp.getTime())));
        const newestMemory = new Date(Math.max(...memories.map((mem) => mem.timestamp.getTime())));
        return {
            totalMemories: memories.length,
            averageSimilarity,
            oldestMemory,
            newestMemory,
        };
    }
    // Alias methods to match the interface
    async updateMemory(memoryId, content, metadata) {
        const success = await this.update(memoryId, content, metadata);
        if (!success) {
            throw new Error(`Failed to update memory ${memoryId}`);
        }
    }
    async clear(scope) {
        let query = supabaseClient_1.supabase.from(this.tableName).delete();
        if (scope) {
            query = query.contains("metadata", { scope });
        }
        const { error } = await query;
        if (error) {
            console.error("Supabase clear error:", error);
            throw new Error(`Failed to clear memories: ${error.message}`);
        }
    }
}
exports.SupabaseMemorySystem = SupabaseMemorySystem;
// Context Memory for short-term workflow state
class ContextMemory {
    constructor(maxSize = 100) {
        this.memory = new Map();
        this.maxSize = maxSize;
    }
    set(key, value) {
        if (this.memory.size >= this.maxSize) {
            const firstKey = this.memory.keys().next().value;
            if (firstKey) {
                this.memory.delete(firstKey);
            }
        }
        this.memory.set(key, { value, timestamp: Date.now() });
    }
    get(key) {
        const entry = this.memory.get(key);
        return entry ? entry.value : undefined;
    }
    has(key) {
        return this.memory.has(key);
    }
    delete(key) {
        return this.memory.delete(key);
    }
    clear() {
        this.memory.clear();
    }
    keys() {
        return Array.from(this.memory.keys());
    }
    values() {
        return Array.from(this.memory.values()).map((entry) => entry.value);
    }
    entries() {
        return Array.from(this.memory.entries()).map(([key, entry]) => [
            key,
            entry.value,
        ]);
    }
    size() {
        return this.memory.size;
    }
    // Get entries sorted by recency
    getRecent(limit = 10) {
        return Array.from(this.memory.entries())
            .sort((a, b) => b[1].timestamp - a[1].timestamp)
            .slice(0, limit)
            .map(([key, entry]) => [key, entry.value]);
    }
}
exports.ContextMemory = ContextMemory;
