-- 1. Reactions
CREATE TABLE public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reactions_select_participants" ON public.message_reactions FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "reactions_insert_own" ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "reactions_delete_own" ON public.message_reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- 2. Translation corrections
CREATE TABLE public.translation_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_language text NOT NULL,
  target_language text NOT NULL,
  original_text text NOT NULL,
  previous_translation text,
  corrected_translation text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.translation_corrections TO authenticated;
GRANT ALL ON public.translation_corrections TO service_role;
ALTER TABLE public.translation_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corrections_select_participants" ON public.translation_corrections FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "corrections_insert_participants" ON public.translation_corrections FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_participant(conversation_id, auth.uid()));
CREATE INDEX idx_corrections_conversation ON public.translation_corrections (conversation_id, created_at DESC);

-- 3. Conversation translation memory (never global)
CREATE TABLE public.conversation_translation_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  term text NOT NULL,
  preferred_translation text NOT NULL,
  source_language text,
  target_language text NOT NULL,
  kind text NOT NULL DEFAULT 'expression',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, term, target_language)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_translation_memory TO authenticated;
GRANT ALL ON public.conversation_translation_memory TO service_role;
ALTER TABLE public.conversation_translation_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "memory_select_participants" ON public.conversation_translation_memory FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "memory_write_participants" ON public.conversation_translation_memory FOR INSERT TO authenticated
  WITH CHECK (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "memory_update_participants" ON public.conversation_translation_memory FOR UPDATE TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()))
  WITH CHECK (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "memory_delete_participants" ON public.conversation_translation_memory FOR DELETE TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()));
CREATE TRIGGER conversation_translation_memory_set_updated_at
  BEFORE UPDATE ON public.conversation_translation_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS translation_memory_enabled boolean NOT NULL DEFAULT true;

-- 4. Invites (QR / web link)
CREATE TABLE public.conversation_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  revoked_at timestamptz,
  uses integer NOT NULL DEFAULT 0,
  max_uses integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.conversation_invites TO authenticated;
GRANT ALL ON public.conversation_invites TO service_role;
ALTER TABLE public.conversation_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invites_select_own" ON public.conversation_invites FOR SELECT TO authenticated
  USING (inviter_id = auth.uid());
CREATE POLICY "invites_insert_own" ON public.conversation_invites FOR INSERT TO authenticated
  WITH CHECK (inviter_id = auth.uid()
    AND (conversation_id IS NULL OR public.is_participant(conversation_id, auth.uid())));
CREATE POLICY "invites_update_own" ON public.conversation_invites FOR UPDATE TO authenticated
  USING (inviter_id = auth.uid()) WITH CHECK (inviter_id = auth.uid());

-- 5. Voice messages
CREATE TABLE public.voice_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  audio_path text NOT NULL,
  duration_ms integer,
  transcript text,
  transcript_language text,
  transcription_status text NOT NULL DEFAULT 'pending',
  transcription_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.voice_messages TO authenticated;
GRANT ALL ON public.voice_messages TO service_role;
ALTER TABLE public.voice_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_select_participants" ON public.voice_messages FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()));
CREATE POLICY "voice_insert_participants" ON public.voice_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_participant(conversation_id, auth.uid()));
CREATE TRIGGER voice_messages_set_updated_at
  BEFORE UPDATE ON public.voice_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Attachments (photos, link previews)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 7. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.translation_corrections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.voice_messages;