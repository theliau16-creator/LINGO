CREATE OR REPLACE FUNCTION public.conversation_has_block(_conversation_id uuid, _sender_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants p
    JOIN public.blocked_users b
      ON (b.user_id = p.user_id AND b.blocked_id = _sender_id)
      OR (b.user_id = _sender_id AND b.blocked_id = p.user_id)
    WHERE p.conversation_id = _conversation_id
      AND p.user_id <> _sender_id
  );
$$;

DROP POLICY IF EXISTS "messages_insert" ON public.messages;

CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.is_participant(conversation_id, auth.uid())
    AND NOT public.conversation_has_block(conversation_id, auth.uid())
  );