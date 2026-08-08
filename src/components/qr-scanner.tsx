import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

let elementCounter = 0;

/** Camera QR scanner. Loads html5-qrcode lazily so SSR stays clean. */
export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (value: string) => void;
  onError?: (message: string) => void;
}) {
  const idRef = useRef(`qr-reader-${++elementCounter}`);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode(idRef.current);
        scanner = instance as unknown as { stop: () => Promise<void>; clear: () => void };
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onResult(decoded);
          },
          () => undefined,
        );
        if (!cancelled) setReady(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Caméra indisponible.";
        setFailed(message);
        onError?.(message);
      }
    })();

    return () => {
      cancelled = true;
      if (scanner) {
        void scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => undefined);
      }
    };
  }, [onError, onResult]);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black/60">
      <div id={idRef.current} className="min-h-[260px] w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-56 w-56 rounded-3xl border-2 border-primary/70 shadow-glow" />
      </div>
      {!ready && !failed ? (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Activation de la caméra…
        </div>
      ) : null}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {failed}
        </div>
      ) : null}
    </div>
  );
}
