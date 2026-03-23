-- ═══ HUGO BREVO UPGRADE — 4 tables completes ═══
-- Setup client email sequences, tracking, sentiment analysis, blacklist

-- 1. Email Sequences (per-client prospect sequences)
CREATE TABLE IF NOT EXISTS email_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE CASCADE,
  -- Sequence config
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','completed','stopped')),
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 3,
  autonomy_level INTEGER DEFAULT 1 CHECK (autonomy_level IN (1, 2, 3)),
  -- Timing
  next_action_at TIMESTAMPTZ,
  paused_reason TEXT, -- 'awaiting_client_validation', 'meeting_requested', 'negative_reply'
  -- Client email config
  sender_name TEXT, -- 'Pierre de XYZ Agency'
  sender_email TEXT, -- 'contact@sonbusiness.fr'
  brevo_child_key TEXT, -- Brevo sub-account key
  -- Warmup tracking
  warmup_week INTEGER DEFAULT 1,
  daily_sent_count INTEGER DEFAULT 0,
  daily_limit INTEGER DEFAULT 20, -- Week 1: 20, Week 2: 50, Week 3+: 100
  -- Multi-tenant
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_sequences_client ON email_sequences(client_id);
CREATE INDEX IF NOT EXISTS idx_email_sequences_prospect ON email_sequences(prospect_id);
CREATE INDEX IF NOT EXISTS idx_email_sequences_status ON email_sequences(status);
CREATE INDEX IF NOT EXISTS idx_email_sequences_next_action ON email_sequences(next_action_at);

-- 2. Emails Sent (tracking each individual email)
CREATE TABLE IF NOT EXISTS emails_sent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID REFERENCES email_sequences(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE SET NULL,
  -- Email content
  prospect_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  step INTEGER NOT NULL DEFAULT 1,
  -- Brevo tracking
  brevo_message_id TEXT,
  -- Status tracking
  status TEXT DEFAULT 'sent' CHECK (status IN ('draft','sent','delivered','opened','clicked','replied','bounced','spam')),
  -- Timestamps
  sent_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_emails_sent_sequence ON emails_sent(sequence_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_client ON emails_sent(client_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_prospect_email ON emails_sent(prospect_email);
CREATE INDEX IF NOT EXISTS idx_emails_sent_brevo ON emails_sent(brevo_message_id);
CREATE INDEX IF NOT EXISTS idx_emails_sent_status ON emails_sent(status);

-- 3. Email Replies (sentiment analysis per reply)
CREATE TABLE IF NOT EXISTS email_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_sent_id UUID REFERENCES emails_sent(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES crm_prospects(id) ON DELETE SET NULL,
  prospect_email TEXT NOT NULL,
  -- Reply content
  body TEXT NOT NULL,
  subject TEXT,
  -- Sentiment analysis (6 categories)
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative','technical','meeting_request','unsubscribe')),
  sentiment_score REAL DEFAULT 0.5 CHECK (sentiment_score >= 0 AND sentiment_score <= 1),
  key_points TEXT[], -- extracted key points
  urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('urgent','high','medium','low')),
  -- Action taken
  action_taken TEXT CHECK (action_taken IN ('draft_created','auto_replied','stopped','blacklisted','notified','escalated')),
  draft_id TEXT, -- Brevo draft ID if created
  auto_reply_body TEXT, -- The auto-reply sent (if any)
  -- Timestamps
  received_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_replies_client ON email_replies(client_id);
CREATE INDEX IF NOT EXISTS idx_email_replies_sentiment ON email_replies(sentiment);
CREATE INDEX IF NOT EXISTS idx_email_replies_email_sent ON email_replies(email_sent_id);

-- 4. Email Blacklist (per-client unsubscribe/stop)
CREATE TABLE IF NOT EXISTS email_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'unsubscribe', -- 'unsubscribe', 'spam_complaint', 'bounce', 'manual', 'negative'
  source TEXT, -- 'prospect_reply', 'brevo_webhook', 'admin', 'hugo_auto'
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, email)
);

CREATE INDEX IF NOT EXISTS idx_email_blacklist_client ON email_blacklist(client_id);
CREATE INDEX IF NOT EXISTS idx_email_blacklist_email ON email_blacklist(email);

-- RLS policies
ALTER TABLE email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails_sent ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_blacklist ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users see own email_sequences" ON email_sequences FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Users see own emails_sent" ON emails_sent FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Users see own email_replies" ON email_replies FOR ALL USING (client_id = auth.uid());
CREATE POLICY "Users see own email_blacklist" ON email_blacklist FOR ALL USING (client_id = auth.uid());

-- Service role full access (for agents)
CREATE POLICY "Service role on email_sequences" ON email_sequences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role on emails_sent" ON emails_sent FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role on email_replies" ON email_replies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role on email_blacklist" ON email_blacklist FOR ALL USING (true) WITH CHECK (true);

-- Add autonomy_level and email config to profiles for client settings
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_autonomy_level INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_sender_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_sender_email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_brevo_child_key TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_warmup_week INTEGER DEFAULT 1;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_email_tone TEXT DEFAULT 'friendly';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hugo_daily_limit INTEGER DEFAULT 20;
