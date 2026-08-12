import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { MEDIA_BUCKET } from "./upload-media";

/** Direct port of useSignedMedia (src/hooks/useSignedMedia.ts). */
export function useSignedMedia(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!path) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setUrl(data.signedUrl);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data: url, isLoading };
}
