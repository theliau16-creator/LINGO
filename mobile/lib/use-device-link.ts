import { useState } from "react";
import { issueDeviceLinkToken, type DeviceLinkToken } from "./device-link";

/** Owns the "generate a device-link QR" state for the Profile screen. */
export function useDeviceLink() {
  const [token, setToken] = useState<DeviceLinkToken | null>(null);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      setToken(await issueDeviceLinkToken());
    } finally {
      setGenerating(false);
    }
  }

  return { token, generating, generate };
}
