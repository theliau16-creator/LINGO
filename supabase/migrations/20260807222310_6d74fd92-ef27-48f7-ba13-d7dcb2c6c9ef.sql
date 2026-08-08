CREATE OR REPLACE FUNCTION public.create_direct_conversation(_friend_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _me uuid := auth.uid(); _conv uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _friend_id IS NULL OR _friend_id = _me THEN RAISE EXCEPTION 'Invalid friend'; END IF;

  SELECT p1.conversation_id INTO _conv
  FROM public.conversation_participants p1
  JOIN public.conversation_participants p2
    ON p2.conversation_id = p1.conversation_id AND p2.user_id = _friend_id
  WHERE p1.user_id = _me
  LIMIT 1;

  IF _conv IS NOT NULL THEN RETURN _conv; END IF;

  INSERT INTO public.conversations (created_by) VALUES (_me) RETURNING id INTO _conv;
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (_conv, _me), (_conv, _friend_id)
  ON CONFLICT DO NOTHING;

  RETURN _conv;
END; $$;

REVOKE ALL ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;