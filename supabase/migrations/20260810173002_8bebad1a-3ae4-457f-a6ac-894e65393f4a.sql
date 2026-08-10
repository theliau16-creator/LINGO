ALTER TABLE public.message_translations ADD COLUMN IF NOT EXISTS alternative_translation text;

CREATE TABLE public.guest_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid REFERENCES public.conversation_invites(id) ON DELETE SET NULL,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  token_hash text NOT NULL UNIQUE,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_seen_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_users TO authenticated;
GRANT ALL ON public.guest_users TO service_role;

ALTER TABLE public.guest_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guests_select_participants" ON public.guest_users
  FOR SELECT TO authenticated
  USING (public.is_participant(conversation_id, auth.uid()));

CREATE TRIGGER guest_users_set_updated_at
  BEFORE UPDATE ON public.guest_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX guest_users_conversation_idx ON public.guest_users (conversation_id);

ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.guest_users(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_author_present CHECK (sender_id IS NOT NULL OR guest_id IS NOT NULL);

CREATE TABLE public.link_previews (
  url text PRIMARY KEY,
  title text,
  description text,
  image_url text,
  site_name text,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.link_previews TO authenticated;
GRANT ALL ON public.link_previews TO service_role;

ALTER TABLE public.link_previews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "link_previews_read" ON public.link_previews
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "chat_media_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND public.is_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "chat_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND public.is_participant(((storage.foldername(name))[1])::uuid, auth.uid())
  );

CREATE POLICY "chat_media_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND owner = auth.uid()
  );