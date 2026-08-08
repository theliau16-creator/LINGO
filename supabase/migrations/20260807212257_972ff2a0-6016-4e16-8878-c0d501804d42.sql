CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_roles_select_own" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE TABLE public.translation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  original_text text NOT NULL,
  detected_language text,
  source_language text NOT NULL,
  target_language text NOT NULL,
  translated_text text,
  engine text NOT NULL DEFAULT 'lovable-ai',
  duration_ms integer,
  status text NOT NULL DEFAULT 'success',
  error text,
  estimated_cost numeric(10,6),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.translation_logs TO authenticated;
GRANT ALL ON public.translation_logs TO service_role;

ALTER TABLE public.translation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "translation_logs_admin_select" ON public.translation_logs
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX translation_logs_created_at_idx ON public.translation_logs (created_at DESC);