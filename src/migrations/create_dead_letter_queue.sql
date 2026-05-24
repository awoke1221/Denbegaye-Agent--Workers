-- Migration: create_dead_letter_queue.sql
-- Stores jobs that failed permanently and require manual inspection or reprocessing.

CREATE TABLE IF NOT EXISTS dead_letter_queue (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id text,
  job_type text,
  payload jsonb,
  error_message text,
  attempts int DEFAULT 0,
  user_id uuid,
  execution_id text,
  created_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false,
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_user ON dead_letter_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_job ON dead_letter_queue(job_id);

-- Optional: RLS policy to allow users to view their own dead letters
ALTER TABLE dead_letter_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own dead letters" ON dead_letter_queue;
CREATE POLICY "Users can view own dead letters" ON dead_letter_queue
  FOR SELECT
  USING (user_id IS NULL OR user_id = auth.uid());

-- Admins should be able to manage dead letters via admin role (configure in policies as needed)
