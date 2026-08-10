ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_id text;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_id_key
  ON public.messages (sender_id, client_id)
  WHERE client_id IS NOT NULL AND sender_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS messages_stalled_translation_idx
  ON public.messages (conversation_id, created_at)
  WHERE translation_status = 'pending';

CREATE INDEX IF NOT EXISTS conversation_participants_user_id_idx
  ON public.conversation_participants (user_id);