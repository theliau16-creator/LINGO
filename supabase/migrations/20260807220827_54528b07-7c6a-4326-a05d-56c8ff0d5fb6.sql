ALTER TABLE public.friend_requests ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS friend_requests_set_updated_at ON public.friend_requests;
CREATE TRIGGER friend_requests_set_updated_at
BEFORE UPDATE ON public.friend_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.friend_requests DROP CONSTRAINT IF EXISTS friend_requests_status_check;
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_status_check
  CHECK (status IN ('pending','accepted','declined','blocked'));

ALTER TABLE public.friend_requests DROP CONSTRAINT IF EXISTS friend_requests_no_self;
ALTER TABLE public.friend_requests ADD CONSTRAINT friend_requests_no_self
  CHECK (sender_id <> receiver_id);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair
  ON public.friendships (user_id, friend_id);

ALTER TABLE public.friendships REPLICA IDENTITY FULL;
ALTER TABLE public.friend_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END $$;