import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Free-plan translation counter for the signed-in user. */
export const getTranslationQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getQuotaState } = await import("./quota.server");
    return getQuotaState(context.userId);
  });

/** Admin-only: every account with its plan and translation usage. */
export const adminListAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin, listAccounts } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    return listAccounts();
  });

/** Admin-only: resets one account's translation counter. */
export const adminResetQuota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input?.userId) throw new Error("userId requis");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./admin.server");
    await requireAdmin(context.supabase, context.userId);
    const { resetQuota } = await import("./quota.server");
    await resetQuota(data.userId);
    return { ok: true };
  });
