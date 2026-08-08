CREATE TABLE IF NOT EXISTS public.translation_usage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.translation_usage TO authenticated;
GRANT ALL ON public.translation_usage TO service_role;

ALTER TABLE public.translation_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translation_usage_select_own" ON public.translation_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER translation_usage_set_updated_at
  BEFORE UPDATE ON public.translation_usage
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS muted_at timestamptz;

CREATE POLICY "subscriptions_admin_select" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));