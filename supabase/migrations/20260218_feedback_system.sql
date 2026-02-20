-- ============================================
-- MIGRATION: Système Feedback + Support Keiro
-- Date: 2026-02-18
-- ============================================

-- A. Table feedback_responses (questionnaires)
CREATE TABLE IF NOT EXISTS public.feedback_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  ratings JSONB NOT NULL,
  comments JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_responses(created_at DESC);
ALTER TABLE public.feedback_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert feedback" ON public.feedback_responses
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own feedback" ON public.feedback_responses
  FOR SELECT USING (auth.uid() = user_id);

-- B. Table contact_requests (demandes support / chat)
CREATE TABLE IF NOT EXISTS public.contact_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_name TEXT,
  subject TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contact_status ON contact_requests(status, created_at DESC);
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert contact requests" ON public.contact_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users view own contact requests" ON public.contact_requests
  FOR SELECT USING (auth.uid() = user_id);
