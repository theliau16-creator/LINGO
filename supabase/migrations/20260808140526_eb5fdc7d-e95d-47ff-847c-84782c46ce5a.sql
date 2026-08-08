REVOKE EXECUTE ON FUNCTION public.conversation_has_block(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conversation_has_block(uuid, uuid) TO authenticated, service_role;