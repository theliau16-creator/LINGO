CREATE OR REPLACE FUNCTION public.create_group_conversation(_name text, _member_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _me uuid := auth.uid();
  _conv uuid;
  _clean uuid[];
  _member uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF btrim(coalesce(_name, '')) = '' THEN RAISE EXCEPTION 'Le nom du groupe est requis.'; END IF;

  SELECT array_agg(DISTINCT m) INTO _clean
  FROM unnest(coalesce(_member_ids, '{}'::uuid[])) AS m
  WHERE m IS NOT NULL AND m <> _me;

  IF _clean IS NULL OR array_length(_clean, 1) < 2 THEN
    RAISE EXCEPTION 'Un groupe demande au moins 2 autres participants.';
  END IF;
  IF array_length(_clean, 1) > 19 THEN
    RAISE EXCEPTION '20 participants maximum.';
  END IF;

  -- Only confirmed friends can be added to a group.
  FOREACH _member IN ARRAY _clean LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = _me AND f.friend_id = _member
    ) THEN
      RAISE EXCEPTION 'Vous ne pouvez ajouter que vos contacts.';
    END IF;
  END LOOP;

  INSERT INTO public.conversations (created_by, type, name)
  VALUES (_me, 'group', btrim(_name))
  RETURNING id INTO _conv;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (_conv, _me, 'admin');

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  SELECT _conv, m, 'member' FROM unnest(_clean) AS m
  ON CONFLICT DO NOTHING;

  RETURN _conv;
END;
$$;

REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_group_conversation(text, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[]) TO authenticated;