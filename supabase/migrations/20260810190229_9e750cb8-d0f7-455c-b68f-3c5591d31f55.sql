CREATE OR REPLACE FUNCTION public.enforce_message_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _subject text;
  _row record;
BEGIN
  _subject := COALESCE(NEW.sender_id::text, NEW.guest_id::text);
  IF _subject IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _row FROM public.check_rate_limit('message_send:' || _subject, 40, 60);

  IF NOT _row.allowed THEN
    RAISE EXCEPTION 'RATE_LIMITED:%', _row.retry_after
      USING HINT = 'Trop de messages envoyés, patientez un instant.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_rate_limit ON public.messages;
CREATE TRIGGER messages_rate_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_rate_limit();