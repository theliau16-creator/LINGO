CREATE OR REPLACE FUNCTION public.shares_conversation(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants p1
    JOIN public.conversation_participants p2
      ON p2.conversation_id = p1.conversation_id
    WHERE p1.user_id = _a AND p2.user_id = _b
  );
$$;

DROP POLICY IF EXISTS profiles_select_authenticated ON public.profiles;

CREATE POLICY profiles_select_visible
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.user_id = auth.uid() AND f.friend_id = profiles.id
  )
  OR EXISTS (
    SELECT 1 FROM public.friend_requests r
    WHERE (r.sender_id = auth.uid() AND r.receiver_id = profiles.id)
       OR (r.sender_id = profiles.id AND r.receiver_id = auth.uid())
  )
  OR public.shares_conversation(auth.uid(), profiles.id)
);

CREATE OR REPLACE FUNCTION public.search_profiles(_query text)
RETURNS TABLE (
  id uuid,
  username text,
  avatar_url text,
  primary_language text,
  country text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.username, p.avatar_url, p.primary_language, p.country
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND length(btrim(coalesce(_query, ''))) >= 2
    AND (
      p.username ILIKE '%' || btrim(_query) || '%'
      OR p.phone = btrim(_query)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.blocked_users b
      WHERE (b.user_id = p.id AND b.blocked_id = auth.uid())
         OR (b.user_id = auth.uid() AND b.blocked_id = p.id)
    )
  ORDER BY p.username
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.search_profiles(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_conversation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conversation_has_block(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_conversation(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_friend_request(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_has_block(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_conversation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;
GRANT ALL ON FUNCTION public.bump_conversation() TO service_role;
GRANT ALL ON FUNCTION public.has_active_subscription(uuid, text) TO service_role;