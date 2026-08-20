-- Push notifications (Phase 10 mobile): device token registry + exactly-once
-- send bookkeeping on messages. No RLS change to messages itself needed —
-- push_notified_at is only ever written by service-role code (push.server.ts).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS push_notified_at timestamptz;

CREATE TABLE public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_tokens_user_id_idx ON public.device_tokens (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_tokens TO authenticated;
GRANT ALL ON public.device_tokens TO service_role;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
-- A signed-in device may only register/read/remove its own tokens. Reading
-- another user's token (to send them a push) is a service-role-only
-- operation, done from push.server.ts — never from an authenticated client.
CREATE POLICY device_tokens_own ON public.device_tokens FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER device_tokens_set_updated_at BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
