CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_key ON public.profiles (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_username_trgm ON public.profiles USING gin (lower(username) gin_trgm_ops);

CREATE TABLE public.chat_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  background_type text NOT NULL DEFAULT 'default',
  background_value text,
  outgoing_message_color text,
  incoming_message_color text,
  theme text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX chat_preferences_user_conversation_key
  ON public.chat_preferences (user_id, conversation_id)
  WHERE conversation_id IS NOT NULL;
CREATE UNIQUE INDEX chat_preferences_user_global_key
  ON public.chat_preferences (user_id)
  WHERE conversation_id IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.chat_preferences TO authenticated;
GRANT ALL ON public.chat_preferences TO service_role;
ALTER TABLE public.chat_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_preferences_own ON public.chat_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER chat_preferences_set_updated_at BEFORE UPDATE ON public.chat_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.blocked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.blocked_users TO authenticated;
GRANT ALL ON public.blocked_users TO service_role;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY blocked_users_own ON public.blocked_users FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.device_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.device_link_tokens TO authenticated;
GRANT ALL ON public.device_link_tokens TO service_role;
ALTER TABLE public.device_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY device_link_tokens_own ON public.device_link_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);