-- 1. Phone number: no signed-in user (not even via broad profile visibility) can read it through the Data API.
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username, avatar_url, primary_language, secondary_language, country, status, created_at, updated_at)
  ON public.profiles TO authenticated;

-- 2. Guest session token hash: server-only (service_role) column.
REVOKE SELECT ON public.guest_users FROM authenticated;
REVOKE SELECT ON public.guest_users FROM anon;
GRANT SELECT (id, invite_id, conversation_id, display_name, language, claimed_by, last_seen_at, created_at, updated_at)
  ON public.guest_users TO authenticated;

-- 3. Internal, server-only SECURITY DEFINER helper: not callable by signed-in users.
REVOKE EXECUTE ON FUNCTION public.is_premium_user(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_premium_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_premium_user(uuid) FROM PUBLIC;