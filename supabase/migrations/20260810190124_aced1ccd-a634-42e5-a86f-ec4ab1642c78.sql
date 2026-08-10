CREATE TABLE IF NOT EXISTS public.rate_limits (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket, window_start)
);

-- Server-only table: no grants to anon/authenticated on purpose.
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY rate_limits_service_only ON public.rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON public.rate_limits (window_start);

-- Atomic fixed-window counter. Returns whether the action is allowed plus the
-- remaining allowance and the retry delay when it is not.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE(allowed boolean, remaining integer, retry_after integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _start timestamptz;
  _count integer;
BEGIN
  IF _limit <= 0 OR _window_seconds <= 0 THEN
    RETURN QUERY SELECT true, 0, 0;
    RETURN;
  END IF;

  _start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO public.rate_limits (bucket, window_start, count, updated_at)
  VALUES (_bucket, _start, 1, now())
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1, updated_at = now()
  RETURNING public.rate_limits.count INTO _count;

  IF _count > _limit THEN
    RETURN QUERY SELECT
      false,
      0,
      GREATEST(1, CEIL(EXTRACT(epoch FROM (_start + make_interval(secs => _window_seconds)) - now()))::integer);
  ELSE
    RETURN QUERY SELECT true, _limit - _count, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_rate_limit(text, integer, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- Housekeeping: drop windows older than a day.
CREATE OR REPLACE FUNCTION public.purge_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.purge_rate_limits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_rate_limits() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_rate_limits() TO service_role;

-- Performance indexes actually used by hot paths.
CREATE INDEX IF NOT EXISTS conversation_participants_user_idx
  ON public.conversation_participants (user_id);

CREATE INDEX IF NOT EXISTS voice_messages_stalled_idx
  ON public.voice_messages (transcription_status, processing_started_at)
  WHERE transcription_status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS messages_attachments_idx
  ON public.messages USING gin (attachments)
  WHERE attachments <> '[]'::jsonb;