import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { deleteAccount } from "./account.server";

/** Permanently deletes the signed-in account. Irreversible. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { confirmation: string }) => {
    if (input?.confirmation !== "SUPPRIMER") throw new Error("Confirmation invalide");
    return input;
  })
  .handler(async ({ context }) => deleteAccount(context.supabase, context.userId));

/** RGPD: full JSON export of everything stored about the signed-in account. */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { exportAccountData } = await import("./account-export.server");
    return exportAccountData(context.supabase, context.userId);
  });

