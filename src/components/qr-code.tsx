import { useEffect, useState } from "react";

/** Renders a QR code as a data-URL image (client only). */
export function QrCode({ value, size = 232 }: { value: string; size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(value, {
        width: size * 2,
        margin: 1,
        color: { dark: "#0b1020", light: "#ffffff" },
      });
      if (!cancelled) setSrc(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [size, value]);

  if (!src) {
    return (
      <div
        className="animate-pulse rounded-3xl bg-secondary/60"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={src}
      alt="QR code"
      width={size}
      height={size}
      className="rounded-3xl bg-white p-3"
      data-qr-image
    />
  );
}
