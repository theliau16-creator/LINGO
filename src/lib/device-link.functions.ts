import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Issues a short-lived QR token for the signed-in device. */
export const issueDeviceLinkToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { createDeviceLinkToken } = await import("./device-link.server");
    return createDeviceLinkToken(context.supabase, context.userId);
  });

/** Exchanges a scanned QR token for a one-time sign-in hash. */
export const redeemDeviceLinkToken = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string }) => {
    if (!input?.token || input.token.length < 16) throw new Error("Jeton invalide");
    return input;
  })
  .handler(async ({ data }) => {
    const { consumeDeviceLinkToken } = await import("./device-link.server");
    return consumeDeviceLinkToken(data.token);
  });
