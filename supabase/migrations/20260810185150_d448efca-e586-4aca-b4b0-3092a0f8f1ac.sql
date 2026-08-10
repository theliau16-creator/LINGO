-- 1. Atomic translation quota -------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_translation_quota(_user_id uuid, _amount integer DEFAULT 1)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.translation_usage (user_id, used)
  VALUES (_user_id, GREATEST(_amount, 0))
  ON CONFLICT (user_id) DO UPDATE
    SET used = public.translation_usage.used + GREATEST(_amount, 0),
        updated_at = now()
  RETURNING used;
$$;

REVOKE ALL ON FUNCTION public.consume_translation_quota(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_translation_quota(uuid, integer) TO service_role;

-- 2. Translation job reservation (one paid call per message/language) ---------
CREATE TABLE IF NOT EXISTS public.translation_jobs (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  language text NOT NULL,
  claimed_at timestamp with time zone NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (message_id, language)
);

GRANT ALL ON public.translation_jobs TO service_role;
ALTER TABLE public.translation_jobs ENABLE ROW LEVEL SECURITY;

-- Returns true when the caller took ownership of this (message, language) job.
CREATE OR REPLACE FUNCTION public.claim_translation_slot(
  _message_id uuid,
  _language text,
  _stale_seconds integer DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _ok boolean;
BEGIN
  INSERT INTO public.translation_jobs (message_id, language)
  VALUES (_message_id, _language)
  ON CONFLICT (message_id, language) DO UPDATE
    SET claimed_at = now(),
        attempts = public.translation_jobs.attempts + 1
    WHERE public.translation_jobs.claimed_at < now() - make_interval(secs => _stale_seconds)
  RETURNING true INTO _ok;
  RETURN COALESCE(_ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_translation_slot(_message_id uuid, _language text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.translation_jobs WHERE message_id = _message_id AND language = _language;
$$;

REVOKE ALL ON FUNCTION public.claim_translation_slot(uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_translation_slot(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_translation_slot(uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_translation_slot(uuid, text) TO service_role;

-- 3. Voice transcription lock -------------------------------------------------
ALTER TABLE public.voice_messages
  ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS voice_messages_recovery_idx
  ON public.voice_messages (conversation_id, transcription_status, updated_at);

-- Atomically takes ownership of a voice job; false when another worker holds it.
CREATE OR REPLACE FUNCTION public.claim_voice_job(_message_id uuid, _stale_seconds integer DEFAULT 120)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.voice_messages
     SET processing_started_at = now(),
         attempt_count = attempt_count + 1,
         transcription_status = CASE
           WHEN transcript IS NOT NULL AND length(btrim(transcript)) > 0 THEN transcription_status
           ELSE 'transcribing' END
   WHERE message_id = _message_id
     AND transcription_status <> 'completed'
     AND (processing_started_at IS NULL
          OR processing_started_at < now() - make_interval(secs => _stale_seconds))
  RETURNING id INTO _id;
  RETURN _id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_voice_job(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_voice_job(uuid, integer) TO service_role;

-- 4. Atomic invite usage ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_invite_use(_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _id uuid;
BEGIN
  UPDATE public.conversation_invites
     SET uses = uses + 1
   WHERE id = _invite_id
     AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > now())
     AND (max_uses IS NULL OR uses < max_uses)
  RETURNING id INTO _id;
  RETURN _id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invite_use(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invite_use(uuid) TO service_role;

-- 5. Idempotence for guest-authored messages ----------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS messages_guest_client_id_key
  ON public.messages (guest_id, client_id)
  WHERE client_id IS NOT NULL AND guest_id IS NOT NULL;

-- 6. Single source of truth for premium status --------------------------------
CREATE OR REPLACE FUNCTION public.is_premium_user(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND (
        s.status IN ('active', 'trialing')
        OR (s.status = 'canceled' AND s.current_period_end IS NOT NULL AND s.current_period_end > now())
        OR (s.status = 'past_due' AND s.current_period_end IS NOT NULL
            AND s.current_period_end > now() - interval '7 days')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_premium_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_premium_user(uuid) TO authenticated, service_role;