DROP POLICY IF EXISTS cp_insert ON public.conversation_participants;
CREATE POLICY cp_insert ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
        AND c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS conv_update ON public.conversations;
CREATE POLICY conv_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.is_participant(id, auth.uid())
    AND (
      type <> 'group'
      OR EXISTS (
        SELECT 1 FROM public.conversation_participants p
        WHERE p.conversation_id = conversations.id
          AND p.user_id = auth.uid()
          AND p.role = 'admin'
      )
    )
  )
  WITH CHECK (
    public.is_participant(id, auth.uid())
    AND (
      type <> 'group'
      OR EXISTS (
        SELECT 1 FROM public.conversation_participants p
        WHERE p.conversation_id = conversations.id
          AND p.user_id = auth.uid()
          AND p.role = 'admin'
      )
    )
  );