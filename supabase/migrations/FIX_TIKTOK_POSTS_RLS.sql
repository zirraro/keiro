-- Fix: Ensure RLS policies exist for tiktok_posts table
-- Date: 2026-02-03
-- Issue: Widget shows no posts because SELECT policy missing

-- 1. Enable RLS (if not already)
ALTER TABLE public.tiktok_posts ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Users can view own tiktok posts
DROP POLICY IF EXISTS "Users can view own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can view own tiktok posts"
  ON public.tiktok_posts
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 3. Policy: Users can insert own tiktok posts
DROP POLICY IF EXISTS "Users can insert own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can insert own tiktok posts"
  ON public.tiktok_posts
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4. Policy: Users can update own tiktok posts
DROP POLICY IF EXISTS "Users can update own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can update own tiktok posts"
  ON public.tiktok_posts
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5. Policy: Users can delete own tiktok posts
DROP POLICY IF EXISTS "Users can delete own tiktok posts" ON public.tiktok_posts;
CREATE POLICY "Users can delete own tiktok posts"
  ON public.tiktok_posts
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ✅ Result: All RLS policies created for tiktok_posts
