import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Bug, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/app-shell";
import { useIsAdmin } from "@/hooks/useDeveloperMode";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/chat-theme";
import { adminListAccounts, adminResetQuota } from "@/lib/quota.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administration — Lingo" },
      { name: "description", content: "Suivi des comptes, des quotas de traduction et des logs." },
      { property: "og:title", content: "Administration — Lingo" },
      {
        property: "og:description",
        content: "Suivi des comptes, des quotas de traduction et des logs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminPage,
});

type Account = {
  id: string;
  username: string;
  primaryLanguage: string;
  country: string | null;
  createdAt: string;
  used: number;
  limit: number | null;
  isPremium: boolean;
};

function AdminPage() {
  const { data: isAdmin, isLoading: checking } = useIsAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listAccounts = useServerFn(adminListAccounts);
  const resetQuota = useServerFn(adminResetQuota);
  const [search, setSearch] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["admin-accounts"],
    enabled: Boolean(isAdmin),
    queryFn: async () => (await listAccounts()) as Account[],
  });

  const logsQuery = useQuery({
    queryKey: ["admin-translation-logs"],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("translation_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const reset = useMutation({
    mutationFn: async (userId: string) => resetQuota({ data: { userId } }),
    onSuccess: () => {
      toast.success("Compteur réinitialisé");
      void queryClient.invalidateQueries({ queryKey: ["admin-accounts"] });
      void queryClient.invalidateQueries({ queryKey: ["translation-quota"] });
    },
    onError: (error) =>
      toast.error("Réinitialisation impossible", {
        description: error instanceof Error ? error.message : "Réessayez.",
      }),
  });

  const accounts = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = accountsQuery.data ?? [];
    if (!term) return rows;
    return rows.filter((row) => row.username.toLowerCase().includes(term));
  }, [accountsQuery.data, search]);

  if (checking) {
    return (
      <AppShell title="Administration">
        <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-muted-foreground" />
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell title="Administration" subtitle="Accès restreint">
        <div className="glass rounded-3xl p-6 text-center text-sm text-muted-foreground">
          Cette section est réservée aux administrateurs.
          <button
            type="button"
            onClick={() => navigate({ to: "/chats" })}
            className="bg-brand mt-4 flex h-11 w-full items-center justify-center rounded-3xl text-sm font-semibold text-primary-foreground"
          >
            Retour aux discussions
          </button>
        </div>
      </AppShell>
    );
  }

  const totalUsed = (accountsQuery.data ?? []).reduce((sum, row) => sum + row.used, 0);
  const premiumCount = (accountsQuery.data ?? []).filter((row) => row.isPremium).length;

  return (
    <AppShell title="Administration" subtitle="Comptes, quotas et diagnostics">
      <section className="mb-5 grid grid-cols-3 gap-2">
        <Stat label="Comptes" value={(accountsQuery.data ?? []).length.toLocaleString("fr-FR")} />
        <Stat label="Premium" value={premiumCount.toLocaleString("fr-FR")} />
        <Stat label="Traductions" value={totalUsed.toLocaleString("fr-FR")} />
      </section>

      <div className="glass mb-4 flex items-center gap-2 rounded-3xl px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher un utilisateur"
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
        />
      </div>

      <section className="mb-6 space-y-2">
        {accountsQuery.isLoading ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
        ) : null}

        {accounts.map((account) => (
          <div key={account.id} className="glass flex items-center gap-3 rounded-3xl p-4">
            <Avatar name={account.username} size={40} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate font-semibold">
                {account.username}
                {account.isPremium ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                ) : null}
              </p>
              <p className="text-xs text-muted-foreground">
                {account.used.toLocaleString("fr-FR")} /{" "}
                {account.limit ? account.limit.toLocaleString("fr-FR") : "∞"} traductions
              </p>
            </div>
            <button
              type="button"
              disabled={reset.isPending}
              onClick={() => {
                haptic();
                reset.mutate(account.id);
              }}
              className="glass flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold text-muted-foreground active:scale-95 disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          <Bug className="h-3.5 w-3.5" /> Dernières traductions
        </h2>
        <div className="glass space-y-2 rounded-3xl p-4">
          {(logsQuery.data ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Aucune traduction enregistrée.</p>
          ) : (
            (logsQuery.data ?? []).map((log) => (
              <pre
                key={log.id}
                className="overflow-x-auto rounded-2xl bg-secondary/40 p-3 text-[11px] leading-5 text-muted-foreground"
              >
                {`${log.source_language} → ${log.target_language} · ${log.engine} · ${log.duration_ms ?? "?"} ms · ${log.status}
original   : ${log.original_text}
traduction : ${log.translated_text ?? "—"}
erreur     : ${log.error ?? "aucune"}`}
              </pre>
            ))
          )}
        </div>
      </section>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-3xl p-4 text-center">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[11px] tracking-widest text-muted-foreground uppercase">{label}</p>
    </div>
  );
}
