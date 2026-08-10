DROP POLICY IF EXISTS chat_preferences_own ON public.chat_preferences;

CREATE POLICY chat_preferences_select_own ON public.chat_preferences
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Reset stays free: removing your own personalisation is not a premium action.
CREATE POLICY chat_preferences_delete_own ON public.chat_preferences
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE policy for `authenticated`: writes go through the server
-- function that verifies the subscription with public.is_premium_user().
REVOKE INSERT, UPDATE ON public.chat_preferences FROM authenticated;
GRANT SELECT, DELETE ON public.chat_preferences TO authenticated;
GRANT ALL ON public.chat_preferences TO service_role;