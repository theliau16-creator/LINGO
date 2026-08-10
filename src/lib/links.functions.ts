import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLinkPreview } from "./links.server";

/** Open Graph card of a link shared in a conversation. */
export const fetchLinkPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { url: string }) => {
    if (!input?.url) throw new Error("url requise");
    if (input.url.length > 2000) throw new Error("URL trop longue.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await (await import("./rate-limit.server")).enforceRateLimit("link_preview", { kind: "user", id: context.userId });
    return getLinkPreview(data.url);
  });
