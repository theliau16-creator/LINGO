import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

let elementCounter = 0;

/** Camera QR scanner. Loads html5-qrcode lazily so SSR stays clean. */
export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (value: string) => void;
  onError?: (message: string) => void;
}) {
  const { t } = useT();
  const idRef = useRef(`qr-reader-${++elementCounter}`);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const handledRef = useRef(false);

  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onErrorRef.current = onError;

  useEffect(() => {
    type Scanner = {
      stop: () => Promise<void>;
      clear: () => void;
      getState: () => number;
    };
    let scanner: Scanner | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        const instance = new Html5Qrcode(idRef.current);
        scanner = instance as unknown as Scanner;
        await instance.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onResultRef.current(decoded);
          },
          () => undefined,
        );
        if (cancelled) {
          // Unmounted while the camera was starting: tear down immediately.
          await instance.stop().catch(() => undefined);
          instance.clear();
          return;
        }
        setReady(true);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : t("media.cameraUnavailable");
        setFailed(message);
        onErrorRef.current?.(message);
      }
    })();

    return () => {
      cancelled = true;
      const current = scanner;
      if (!current) return;
      // html5-qrcode throws if stop() is called when not SCANNING (2) / PAUSED (3).
      const state = typeof current.getState === "function" ? current.getState() : 0;
      if (state === 2 || state === 3) {
        void current
          .stop()
          .then(() => current.clear())
          .catch(() => undefined);
      } else {
        try {
          current.clear();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-3xl bg-black/60">
      {/* Overlays are rendered first and always mounted: html5-qrcode mutates the
          DOM inside the scanner node, so React must never insert siblings after it. */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="h-56 w-56 rounded-3xl border-2 border-primary/70 shadow-glow" />
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        style={{ display: !ready && !failed ? undefined : "none" }}
      >
        <Loader2 className="h-4 w-4 animate-spin" /> {t("media.cameraActivating")}
      </div>
      <div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6 text-center text-sm text-muted-foreground"
        style={{ display: failed ? undefined : "none" }}
      >
        {failed}
      </div>
      <div
        key="qr-host"
        id={idRef.current}
        suppressHydrationWarning
        className="min-h-[260px] w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
      />
    </div>
  );
}

