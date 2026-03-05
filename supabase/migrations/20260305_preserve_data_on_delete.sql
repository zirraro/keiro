-- Migration: Préserver les données utilisateur lors de la suppression du compte
-- Date: 2026-03-05
-- Description: Change ON DELETE CASCADE → ON DELETE SET NULL sur les tables de contenu
-- + Ajoute original_email pour réassociation après re-inscription

-- =============================================
-- 1. Rendre user_id nullable sur les tables de contenu
-- =============================================

DO $$ BEGIN
  ALTER TABLE public.saved_images ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.my_videos ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.instagram_drafts ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.tiktok_drafts ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.library_folders ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.credit_transactions ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.assistant_conversations ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.assistant_messages ALTER COLUMN user_id DROP NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- =============================================
-- 2. Ajouter original_email pour réassociation
-- =============================================

ALTER TABLE public.saved_images ADD COLUMN IF NOT EXISTS original_email TEXT;
ALTER TABLE public.my_videos ADD COLUMN IF NOT EXISTS original_email TEXT;
ALTER TABLE public.instagram_drafts ADD COLUMN IF NOT EXISTS original_email TEXT;
ALTER TABLE public.tiktok_drafts ADD COLUMN IF NOT EXISTS original_email TEXT;
ALTER TABLE public.library_folders ADD COLUMN IF NOT EXISTS original_email TEXT;

-- =============================================
-- 3. Changer CASCADE → SET NULL sur les FK
-- =============================================

-- saved_images
ALTER TABLE public.saved_images DROP CONSTRAINT IF EXISTS saved_images_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.saved_images ADD CONSTRAINT saved_images_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- my_videos
ALTER TABLE public.my_videos DROP CONSTRAINT IF EXISTS my_videos_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.my_videos ADD CONSTRAINT my_videos_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- instagram_drafts
ALTER TABLE public.instagram_drafts DROP CONSTRAINT IF EXISTS instagram_drafts_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.instagram_drafts ADD CONSTRAINT instagram_drafts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- tiktok_drafts
ALTER TABLE public.tiktok_drafts DROP CONSTRAINT IF EXISTS tiktok_drafts_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.tiktok_drafts ADD CONSTRAINT tiktok_drafts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- library_folders
ALTER TABLE public.library_folders DROP CONSTRAINT IF EXISTS library_folders_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.library_folders ADD CONSTRAINT library_folders_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- credit_transactions
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- assistant_conversations
ALTER TABLE public.assistant_conversations DROP CONSTRAINT IF EXISTS assistant_conversations_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.assistant_conversations ADD CONSTRAINT assistant_conversations_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- assistant_messages
ALTER TABLE public.assistant_messages DROP CONSTRAINT IF EXISTS assistant_messages_user_id_fkey;
DO $$ BEGIN
  ALTER TABLE public.assistant_messages ADD CONSTRAINT assistant_messages_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- =============================================
-- 4. Trigger: Sauvegarder l'email avant suppression
-- =============================================

CREATE OR REPLACE FUNCTION preserve_email_before_user_delete()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Récupérer l'email de l'utilisateur supprimé
  SELECT email INTO user_email FROM auth.users WHERE id = OLD.id;

  IF user_email IS NOT NULL THEN
    -- Sauvegarder l'email dans les tables de contenu (ignorer si table/colonne n'existe pas)
    BEGIN UPDATE public.saved_images SET original_email = user_email WHERE user_id = OLD.id; EXCEPTION WHEN others THEN NULL; END;
    BEGIN UPDATE public.my_videos SET original_email = user_email WHERE user_id = OLD.id; EXCEPTION WHEN others THEN NULL; END;
    BEGIN UPDATE public.instagram_drafts SET original_email = user_email WHERE user_id = OLD.id; EXCEPTION WHEN others THEN NULL; END;
    BEGIN UPDATE public.tiktok_drafts SET original_email = user_email WHERE user_id = OLD.id; EXCEPTION WHEN others THEN NULL; END;
    BEGIN UPDATE public.library_folders SET original_email = user_email WHERE user_id = OLD.id; EXCEPTION WHEN others THEN NULL; END;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Le trigger BEFORE DELETE sur auth.users sauvegarde l'email AVANT que SET NULL ne s'applique
DROP TRIGGER IF EXISTS trigger_preserve_email ON auth.users;
CREATE TRIGGER trigger_preserve_email
  BEFORE DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION preserve_email_before_user_delete();

-- =============================================
-- 5. Fonction: Réassocier les données orphelines
-- =============================================

CREATE OR REPLACE FUNCTION reassociate_user_data(new_user_id UUID, user_email TEXT)
RETURNS JSON AS $$
DECLARE
  img_count INTEGER := 0;
  vid_count INTEGER := 0;
  draft_ig_count INTEGER := 0;
  draft_tk_count INTEGER := 0;
  folder_count INTEGER := 0;
BEGIN
  -- Réassocier saved_images
  BEGIN
    UPDATE public.saved_images SET user_id = new_user_id, original_email = NULL
    WHERE original_email = user_email AND user_id IS NULL;
    GET DIAGNOSTICS img_count = ROW_COUNT;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Réassocier my_videos
  BEGIN
    UPDATE public.my_videos SET user_id = new_user_id, original_email = NULL
    WHERE original_email = user_email AND user_id IS NULL;
    GET DIAGNOSTICS vid_count = ROW_COUNT;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Réassocier instagram_drafts
  BEGIN
    UPDATE public.instagram_drafts SET user_id = new_user_id, original_email = NULL
    WHERE original_email = user_email AND user_id IS NULL;
    GET DIAGNOSTICS draft_ig_count = ROW_COUNT;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Réassocier tiktok_drafts
  BEGIN
    UPDATE public.tiktok_drafts SET user_id = new_user_id, original_email = NULL
    WHERE original_email = user_email AND user_id IS NULL;
    GET DIAGNOSTICS draft_tk_count = ROW_COUNT;
  EXCEPTION WHEN others THEN NULL;
  END;

  -- Réassocier library_folders
  BEGIN
    UPDATE public.library_folders SET user_id = new_user_id, original_email = NULL
    WHERE original_email = user_email AND user_id IS NULL;
    GET DIAGNOSTICS folder_count = ROW_COUNT;
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN json_build_object(
    'images', img_count,
    'videos', vid_count,
    'instagram_drafts', draft_ig_count,
    'tiktok_drafts', draft_tk_count,
    'folders', folder_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 6. Mettre à jour les RLS pour données orphelines
-- (admin peut voir/gérer les données sans user_id)
-- =============================================

-- saved_images: permettre aux admins de voir les données orphelines
DROP POLICY IF EXISTS "Admin can view orphaned images" ON public.saved_images;
CREATE POLICY "Admin can view orphaned images"
  ON public.saved_images
  FOR ALL
  USING (
    user_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    )
  );

-- my_videos: idem
DROP POLICY IF EXISTS "Admin can view orphaned videos" ON public.my_videos;
CREATE POLICY "Admin can view orphaned videos"
  ON public.my_videos
  FOR ALL
  USING (
    user_id IS NULL AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    )
  );

-- =============================================
-- 7. Index pour recherche par original_email
-- =============================================

CREATE INDEX IF NOT EXISTS idx_saved_images_original_email ON public.saved_images(original_email) WHERE original_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_my_videos_original_email ON public.my_videos(original_email) WHERE original_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instagram_drafts_original_email ON public.instagram_drafts(original_email) WHERE original_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tiktok_drafts_original_email ON public.tiktok_drafts(original_email) WHERE original_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_library_folders_original_email ON public.library_folders(original_email) WHERE original_email IS NOT NULL;
