-- Migration: create_vector_memory_table.sql
-- Requires the 'vector' extension (pgvector) available on Supabase/Postgres.
-- Run these statements in your Supabase SQL editor or psql.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS vector_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  agent_id uuid,
  content text NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  memory_type text DEFAULT 'generic',
  importance_score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create an index to accelerate similarity search (adjust parameters by dataset size)
-- NOTE: ivfflat requires the number of lists (nlist) tuned for your dataset.
-- Example: CREATE INDEX ON vector_memory USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- If ivfflat is not supported on your platform, fallback to the standard index:
-- CREATE INDEX IF NOT EXISTS idx_vector_memory_user_id ON vector_memory(user_id);

-- Example recommended index (commented out by default):
-- CREATE INDEX IF NOT EXISTS idx_vector_memory_embedding ON vector_memory USING ivfflat (embedding vector_l2_ops) WITH (lists = 128);

-- Security: enable row-level security and policies for per-user access
ALTER TABLE vector_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own memories" ON vector_memory;
CREATE POLICY "Users can manage own memories" ON vector_memory
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
