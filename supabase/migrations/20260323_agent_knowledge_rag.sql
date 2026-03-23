-- Agent Knowledge RAG System
-- Enables vector search for agent knowledge pool

-- Enable pgvector extension (Supabase supports this natively)
CREATE EXTENSION IF NOT EXISTS vector;

-- Knowledge base table with embeddings
CREATE TABLE IF NOT EXISTS agent_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Content
  content TEXT NOT NULL,
  summary TEXT, -- 1-line summary for quick display
  -- Metadata
  agent TEXT, -- which agent created this knowledge (null = shared)
  category TEXT NOT NULL DEFAULT 'general', -- learning, insight, pattern, rule, feedback, best_practice
  source TEXT, -- where this knowledge came from (email_analysis, conversation, admin, auto_learning)
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  -- Business context
  business_type TEXT, -- null = applies to all
  -- Vector embedding for semantic search
  embedding vector(1536), -- OpenAI ada-002 dimension
  -- Multi-tenant
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  -- Lifecycle
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT -- 'system', 'admin', agent name, or user_id
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge(agent);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_category ON agent_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_business_type ON agent_knowledge(business_type);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_confidence ON agent_knowledge(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_org_id ON agent_knowledge(org_id);

-- Vector similarity search index (IVFFlat for performance)
CREATE INDEX IF NOT EXISTS idx_agent_knowledge_embedding ON agent_knowledge
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS
ALTER TABLE agent_knowledge ENABLE ROW LEVEL SECURITY;

-- Service role full access (agents run server-side)
CREATE POLICY "Service role full access on agent_knowledge"
  ON agent_knowledge FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function to search knowledge by embedding similarity
CREATE OR REPLACE FUNCTION search_agent_knowledge(
  query_embedding vector(1536),
  match_threshold REAL DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_agent TEXT DEFAULT NULL,
  filter_category TEXT DEFAULT NULL,
  filter_business_type TEXT DEFAULT NULL,
  filter_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  summary TEXT,
  agent TEXT,
  category TEXT,
  confidence REAL,
  business_type TEXT,
  similarity REAL
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ak.id,
    ak.content,
    ak.summary,
    ak.agent,
    ak.category,
    ak.confidence,
    ak.business_type,
    1 - (ak.embedding <=> query_embedding) AS similarity
  FROM agent_knowledge ak
  WHERE 1 - (ak.embedding <=> query_embedding) > match_threshold
    AND (filter_agent IS NULL OR ak.agent = filter_agent OR ak.agent IS NULL)
    AND (filter_category IS NULL OR ak.category = filter_category)
    AND (filter_business_type IS NULL OR ak.business_type = filter_business_type OR ak.business_type IS NULL)
    AND (filter_org_id IS NULL OR ak.org_id = filter_org_id OR ak.org_id IS NULL)
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Seed initial knowledge from existing learnings (agent_logs with action='learning')
-- This migrates ALL learnings with confidence >= 30 into the RAG system
INSERT INTO agent_knowledge (content, summary, agent, category, confidence, source, created_by)
SELECT
  COALESCE(data->>'learning', data->>'content'),
  LEFT(COALESCE(data->>'learning', data->>'content', ''), 100),
  agent,
  CASE
    WHEN COALESCE((data->>'confidence')::REAL, 50) >= 65 THEN 'best_practice'
    WHEN COALESCE((data->>'confidence')::REAL, 50) >= 40 THEN 'pattern'
    ELSE 'learning'
  END,
  LEAST(COALESCE((data->>'confidence')::REAL, 50) / 100.0, 1.0),
  'migration_from_agent_logs',
  'system'
FROM agent_logs
WHERE action IN ('learning', 'learning_saved')
  AND COALESCE(data->>'learning', data->>'content') IS NOT NULL
  AND COALESCE((data->>'confidence')::REAL, 50) >= 30
ON CONFLICT DO NOTHING;
