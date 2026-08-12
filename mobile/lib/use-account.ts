import { useState } from "react";
import { apiFetch } from "./api";

export type AccountExport = Record<string, unknown>;

/**
 * deleteAccount / exportData — the two Profile/Settings operations that must
 * go through the server: deletion needs `supabaseAdmin.auth.admin.deleteUser`
 * (service role, no client-side equivalent under any circumstances) and the
 * export is explicitly kept server-side (src/routes/api/account/{delete,export}.ts)
 * so its exact shape stays centralised in one place rather than reimplemented
 * as a second, divergent set of Supabase reads on mobile.
 */
export function useAccount() {
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function deleteAccount(confirmation: string) {
    setDeleting(true);
    try {
      return await apiFetch<{ deleted: boolean }>("/api/account/delete", {
        method: "POST",
        body: { confirmation },
      });
    } finally {
      setDeleting(false);
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      return await apiFetch<AccountExport>("/api/account/export");
    } finally {
      setExporting(false);
    }
  }

  return { deleting, exporting, deleteAccount, exportData };
}
