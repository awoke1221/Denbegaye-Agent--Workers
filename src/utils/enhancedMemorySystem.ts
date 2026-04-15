// ===========================================
// DENBEGNAYE AGENT - ENHANCED MEMORY SYSTEM
// Vector Search + Graph Relationships + Supabase
// ===========================================

import { supabase } from './supabaseClient';
import { OpenAIEmbeddings } from '@langchain/openai';

export interface MemoryEntry {
  id: string;
  agentId: string;
  userId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
  memoryType: 'conversation' | 'fact' | 'procedure' | 'context';
  importanceScore: number;
  accessCount: number;
  lastAccessedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

export interface MemoryRelationship {
  id: string;
  sourceMemoryId: string;
  targetMemoryId: string;
  relationshipType: 'related' | 'contradicts' | 'supports' | 'follows';
  strength: number;
  createdAt: Date;
}

// ===========================================
// VECTOR MEMORY SYSTEM
// ===========================================

export class VectorMemorySystem {
  private supabase = supabase;
  private embeddings: OpenAIEmbeddings;

  constructor(openaiApiKey?: string) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: openaiApiKey || process.env.OPENAI_API_KEY!,
      modelName: 'text-embedding-3-small', // 384 dimensions
    });
  }

  async store(
    agentId: string,
    userId: string,
    content: string,
    metadata: Record<string, any> = {},
    memoryType: MemoryEntry['memoryType'] = 'conversation',
    importanceScore: number = 0.5
  ): Promise<string> {
    try {
      // Generate embedding
      const embedding = await this.embeddings.embedQuery(content);

      // Calculate importance score based on content analysis
      const calculatedImportance = await this.calculateImportanceScore(
        content,
        metadata,
        memoryType
      );

      const finalImportance = Math.max(importanceScore, calculatedImportance);

      // Store in Supabase
      const { data, error } = await this.supabase
        .from('agent_memories')
        .insert({
          agent_id: agentId,
          user_id: userId,
          content,
          embedding: `[${embedding.join(',')}]`, // Store as vector
          metadata,
          memory_type: memoryType,
          importance_score: finalImportance,
        })
        .select()
        .single();

      if (error) throw error;

      // Create relationships with existing memories
      await this.createMemoryRelationships(data.id, agentId, userId, content, embedding);

      return data.id;
    } catch (error) {
      console.error('Failed to store memory:', error);
      throw error;
    }
  }

  async search(
    agentId: string,
    userId: string,
    query: string,
    limit: number = 10,
    threshold: number = 0.7,
    memoryTypes?: MemoryEntry['memoryType'][]
  ): Promise<MemoryEntry[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Build search query
      let searchQuery = this.supabase
        .rpc('vector_similarity_search', {
          query_embedding: `[${queryEmbedding.join(',')}]`,
          match_threshold: threshold,
          match_count: limit,
        })
        .eq('agent_id', agentId)
        .eq('user_id', userId);

      if (memoryTypes && memoryTypes.length > 0) {
        searchQuery = searchQuery.in('memory_type', memoryTypes);
      }

      const { data, error } = await searchQuery;

      if (error) throw error;

      // Update access counts
      const memoryIds = data.map((m: any) => m.id);
      if (memoryIds.length > 0) {
        await this.supabase
          .from('agent_memories')
          .update({
            last_accessed_at: new Date().toISOString(),
          })
          .in('id', memoryIds);
      }

      return data.map((row: any) => ({
        id: row.id,
        agentId,
        userId,
        content: row.content,
        embedding: [], // Not returned for performance
        metadata: row.metadata || {},
        memoryType: row.memory_type,
        importanceScore: row.importance_score,
        accessCount: row.access_count,
        lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
        createdAt: new Date(row.created_at),
      }));
    } catch (error) {
      console.error('Failed to search memories:', error);
      throw error;
    }
  }

  async updateImportance(memoryId: string, newScore: number): Promise<void> {
    const { error } = await this.supabase
      .from('agent_memories')
      .update({ importance_score: newScore })
      .eq('id', memoryId);

    if (error) throw error;
  }

  async deleteExpired(): Promise<number> {
    const { data, error } = await this.supabase
      .from('agent_memories')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) throw error;
    return data?.length || 0;
  }

  async consolidateMemories(agentId: string, userId: string): Promise<void> {
    // Get memories that can be consolidated
    const { data: memories } = await this.supabase
      .from('agent_memories')
      .select('*')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .eq('memory_type', 'conversation')
      .lt('importance_score', 0.3)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!memories || memories.length < 5) return;

    // Group related conversations
    const consolidated = await this.consolidateConversationMemories(memories);

    // Store consolidated memory
    for (const consolidatedMemory of consolidated) {
      await this.store(
        agentId,
        userId,
        consolidatedMemory.content,
        consolidatedMemory.metadata,
        'context',
        consolidatedMemory.importanceScore
      );
    }

    // Mark original memories as expired
    await this.supabase
      .from('agent_memories')
      .update({ expires_at: new Date().toISOString() })
      .in(
        'id',
        memories.map(m => m.id)
      );
  }

  private async calculateImportanceScore(
    content: string,
    metadata: Record<string, any>,
    memoryType: MemoryEntry['memoryType']
  ): Promise<number> {
    let score = 0.5; // Base score

    // Content-based scoring
    if (content.length > 500) score += 0.1;
    if (content.includes('error') || content.includes('failed')) score += 0.2;
    if (content.includes('success') || content.includes('completed')) score += 0.1;

    // Metadata-based scoring
    if (metadata.isImportant) score += 0.3;
    if (metadata.userFeedback === 'positive') score += 0.2;
    if (metadata.userFeedback === 'negative') score += 0.1;

    // Type-based scoring
    const typeScores = {
      fact: 0.8,
      procedure: 0.7,
      context: 0.6,
      conversation: 0.4,
    };
    score += typeScores[memoryType] - 0.5;

    return Math.min(1.0, Math.max(0.0, score));
  }

  private async createMemoryRelationships(
    memoryId: string,
    agentId: string,
    userId: string,
    content: string,
    embedding: number[]
  ): Promise<void> {
    // Find similar existing memories
    const similarMemories = await this.search(agentId, userId, content, 5, 0.8);

    for (const similar of similarMemories) {
      if (similar.id === memoryId) continue;

      const relationshipType = this.determineRelationshipType(content, similar.content);
      const strength = this.calculateRelationshipStrength(embedding, similar.embedding || []);

      if (strength > 0.7) {
        await this.supabase
          .from('memory_relationships')
          .insert({
            source_memory_id: memoryId,
            target_memory_id: similar.id,
            relationship_type: relationshipType,
            strength,
          })
          .select()
          .single();
      }
    }
  }

  private determineRelationshipType(
    content1: string,
    content2: string
  ): MemoryRelationship['relationshipType'] {
    // Simple heuristic - can be enhanced with NLP
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;

    if (similarity > 0.8) return 'supports';
    if (similarity > 0.5) return 'related';
    return 'follows';
  }

  private calculateRelationshipStrength(embedding1: number[], embedding2: number[]): number {
    if (!embedding2 || embedding2.length === 0) return 0;

    // Cosine similarity
    const dotProduct = embedding1.reduce((sum, a, i) => sum + a * (embedding2[i] || 0), 0);
    const magnitude1 = Math.sqrt(embedding1.reduce((sum, a) => sum + a * a, 0));
    const magnitude2 = Math.sqrt(embedding2.reduce((sum, a) => sum + a * a, 0));

    return dotProduct / (magnitude1 * magnitude2);
  }

  private async consolidateConversationMemories(memories: any[]): Promise<any[]> {
    // Group conversations by topic/time
    const groups = this.groupConversationsByTopic(memories);

    const consolidated = [];

    for (const group of groups) {
      const consolidatedContent = await this.summarizeConversationGroup(group);
      const importanceScore = group.reduce((sum, m) => sum + m.importance_score, 0) / group.length;

      consolidated.push({
        content: consolidatedContent,
        metadata: {
          originalMemories: group.map(m => m.id),
          consolidationType: 'conversation_summary',
          timeRange: {
            start: group[0].created_at,
            end: group[group.length - 1].created_at,
          },
        },
        importanceScore: Math.min(1.0, importanceScore + 0.1), // Slight boost for consolidation
      });
    }

    return consolidated;
  }

  private groupConversationsByTopic(memories: any[]): any[][] {
    // Simple time-based grouping - can be enhanced with topic modeling
    const groups = [];
    let currentGroup = [memories[0]];

    for (let i = 1; i < memories.length; i++) {
      const timeDiff =
        new Date(memories[i].created_at).getTime() - new Date(memories[i - 1].created_at).getTime();

      if (timeDiff < 3600000) {
        // Within 1 hour
        currentGroup.push(memories[i]);
      } else {
        groups.push(currentGroup);
        currentGroup = [memories[i]];
      }
    }

    if (currentGroup.length > 0) groups.push(currentGroup);

    return groups.filter(group => group.length >= 3); // Only consolidate groups of 3+
  }

  private async summarizeConversationGroup(group: any[]): Promise<string> {
    const contents = group.map(m => m.content).join('\n\n');
    // Use AI to summarize - implementation depends on available AI service
    return `Summary of ${group.length} conversation exchanges: ${contents.substring(0, 200)}...`;
  }
}

// ===========================================
// GRAPH-BASED MEMORY RELATIONSHIPS
// ===========================================

export class MemoryGraph {
  private supabase = supabase;

  async getRelatedMemories(
    memoryId: string,
    depth: number = 2,
    relationshipTypes?: MemoryRelationship['relationshipType'][]
  ): Promise<MemoryEntry[]> {
    const visited = new Set<string>();
    const result = new Set<MemoryEntry>();

    await this.traverseMemoryGraph(memoryId, depth, visited, result, relationshipTypes);

    return Array.from(result);
  }

  async findContradictions(agentId: string, userId: string): Promise<any[]> {
    // Find memories that contradict each other
    const { data } = await this.supabase
      .from('memory_relationships')
      .select(
        `
        source_memory_id,
        target_memory_id,
        relationship_type,
        source:agent_memories!source_memory_id(content, metadata),
        target:agent_memories!target_memory_id(content, metadata)
      `
      )
      .eq('relationship_type', 'contradicts')
      .eq('source.agent_id', agentId)
      .eq('source.user_id', userId);

    return data || [];
  }

  async getMemoryClusters(agentId: string, userId: string): Promise<any[]> {
    // Find densely connected memory clusters
    const query = `
      SELECT
        m1.id as memory_id,
        m1.content,
        COUNT(*) as connection_count
      FROM agent_memories m1
      JOIN memory_relationships mr ON m1.id = mr.source_memory_id OR m1.id = mr.target_memory_id
      WHERE m1.agent_id = $1 AND m1.user_id = $2
      GROUP BY m1.id, m1.content
      HAVING COUNT(*) > 3
      ORDER BY COUNT(*) DESC
    `;

    const { data } = await this.supabase.rpc('get_memory_clusters', {
      agent_id: agentId,
      user_id: userId,
    });

    return data || [];
  }

  private async traverseMemoryGraph(
    memoryId: string,
    depth: number,
    visited: Set<string>,
    result: Set<MemoryEntry>,
    relationshipTypes?: MemoryRelationship['relationshipType'][]
  ): Promise<void> {
    if (depth <= 0 || visited.has(memoryId)) return;

    visited.add(memoryId);

    // Get the memory itself
    const { data: memory } = await this.supabase
      .from('agent_memories')
      .select('*')
      .eq('id', memoryId)
      .single();

    if (memory) {
      result.add(this.transformMemoryRow(memory));
    }

    // Get related memories
    let query = this.supabase
      .from('memory_relationships')
      .select(
        `
        source_memory_id,
        target_memory_id,
        relationship_type,
        source:agent_memories!source_memory_id(*),
        target:agent_memories!target_memory_id(*)
      `
      )
      .or(`source_memory_id.eq.${memoryId},target_memory_id.eq.${memoryId}`);

    if (relationshipTypes && relationshipTypes.length > 0) {
      query = query.in('relationship_type', relationshipTypes);
    }

    const { data: relationships } = await query;

    for (const rel of relationships || []) {
      const relatedId =
        rel.source_memory_id === memoryId ? rel.target_memory_id : rel.source_memory_id;

      await this.traverseMemoryGraph(relatedId, depth - 1, visited, result, relationshipTypes);
    }
  }

  private transformMemoryRow(row: any): MemoryEntry {
    return {
      id: row.id,
      agentId: row.agent_id,
      userId: row.user_id,
      content: row.content,
      embedding: [], // Not loaded for graph traversal
      metadata: row.metadata || {},
      memoryType: row.memory_type,
      importanceScore: row.importance_score,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

// ===========================================
// MEMORY MANAGEMENT SERVICE
// ===========================================

export class MemoryManagementService {
  private vectorMemory: VectorMemorySystem;
  private memoryGraph: MemoryGraph;

  constructor(openaiApiKey?: string) {
    this.vectorMemory = new VectorMemorySystem(openaiApiKey);
    this.memoryGraph = new MemoryGraph();
  }

  async storeMemory(
    agentId: string,
    userId: string,
    content: string,
    options: {
      metadata?: Record<string, any>;
      memoryType?: MemoryEntry['memoryType'];
      importanceScore?: number;
      expiresAt?: Date;
    } = {}
  ): Promise<string> {
    return await this.vectorMemory.store(
      agentId,
      userId,
      content,
      options.metadata,
      options.memoryType,
      options.importanceScore
    );
  }

  async retrieveRelevantMemories(
    agentId: string,
    userId: string,
    query: string,
    options: {
      limit?: number;
      threshold?: number;
      memoryTypes?: MemoryEntry['memoryType'][];
      includeRelated?: boolean;
    } = {}
  ): Promise<MemoryEntry[]> {
    const memories = await this.vectorMemory.search(
      agentId,
      userId,
      query,
      options.limit,
      options.threshold,
      options.memoryTypes
    );

    if (options.includeRelated) {
      const relatedPromises = memories.map(memory =>
        this.memoryGraph.getRelatedMemories(memory.id, 1)
      );

      const relatedResults = await Promise.all(relatedPromises);
      const allMemories = new Map<string, MemoryEntry>();

      // Add primary memories
      memories.forEach(m => allMemories.set(m.id, m));

      // Add related memories
      relatedResults.forEach(relatedList => {
        relatedList.forEach(m => allMemories.set(m.id, m));
      });

      return Array.from(allMemories.values());
    }

    return memories;
  }

  async maintainMemory(agentId: string, userId: string): Promise<void> {
    // Clean up expired memories
    await this.vectorMemory.deleteExpired();

    // Consolidate old conversations
    await this.vectorMemory.consolidateMemories(agentId, userId);

    // Check for contradictions
    const contradictions = await this.memoryGraph.findContradictions(agentId, userId);
    if (contradictions.length > 0) {
      await this.handleContradictions(contradictions);
    }
  }

  private async handleContradictions(contradictions: any[]): Promise<void> {
    // Implementation for handling memory contradictions
    // Could involve user notification or automatic resolution
    console.log(`Found ${contradictions.length} memory contradictions to resolve`);
  }
}
