-- Migration pour l'assistant marketing avec Claude
-- Permet de sauvegarder les conversations et messages pour contexte personnalisé

-- Table des conversations avec l'assistant marketing
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Metadata
  title TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  business_context TEXT, -- Type de business pour contextualiser les conseils

  -- État
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_message_at TIMESTAMP WITH TIME ZONE,

  -- Stats
  message_count INT DEFAULT 0,
  is_pinned BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false
);

-- Table des messages de chaque conversation
CREATE TABLE IF NOT EXISTS assistant_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Contenu
  role VARCHAR(10) CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,

  -- Metadata Claude
  model TEXT DEFAULT 'claude-3-5-sonnet-20240620',
  tokens_used INT,

  -- Timestamp
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_assistant_conversations_user_id
  ON assistant_conversations(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_conversation_id
  ON assistant_messages(conversation_id, created_at ASC);

-- RLS Policies
ALTER TABLE assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_messages ENABLE ROW LEVEL SECURITY;

-- Users can only view their own conversations
CREATE POLICY "Users view own conversations"
  ON assistant_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own conversations
CREATE POLICY "Users create own conversations"
  ON assistant_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
CREATE POLICY "Users update own conversations"
  ON assistant_conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only view their own messages
CREATE POLICY "Users view own messages"
  ON assistant_messages FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own messages
CREATE POLICY "Users create own messages"
  ON assistant_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Commentaires pour documentation
COMMENT ON TABLE assistant_conversations IS 'Conversations avec l''assistant marketing Claude';
COMMENT ON TABLE assistant_messages IS 'Messages échangés dans chaque conversation';
COMMENT ON COLUMN assistant_conversations.business_context IS 'Contexte business de l''utilisateur pour personnalisation des conseils';
COMMENT ON COLUMN assistant_messages.tokens_used IS 'Nombre de tokens utilisés par Claude pour la réponse';
