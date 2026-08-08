CREATE POLICY chat_backgrounds_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'chat-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY chat_backgrounds_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY chat_backgrounds_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'chat-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'chat-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY chat_backgrounds_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'chat-backgrounds' AND (storage.foldername(name))[1] = auth.uid()::text);