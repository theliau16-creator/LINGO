import { Link } from "@tanstack/react-router";
import { Sparkles, Zap } from "lucide-react";
import { useTranslationQuota } from "@/hooks/useTranslationQuota";

/** Free-plan translation counter with an upgrade CTA when it runs low. */
export function QuotaCard() {
  const { data, isLoading } = useTranslationQuota();

  if (isLoading || !data) {
    return <div className="glass h-24 animate-pulse rounded-3xl" />;
  }

  if (data.isPremium) {
    return (
      <div className="glass flex items-center gap-3 rounded-3xl p-4">
        <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold">Traductions illimitées</p>
          <p className="text-xs text-muted-foreground">
            Lingo Premium actif · {data.used.toLocaleString("fr-FR")} traductions utilisées
          </p>
        </div>
      </div>
    );
  }

  const limit = data.limit ?? 5000;
  const remaining = data.remaining ?? 0;
  const ratio = Math.min(100, Math.round((data.used / limit) * 100));
  const low = remaining <= limit * 0.1;

  return (
    <div className="glass rounded-3xl p-4">
      <div className="flex items-center gap-3">
        <span className="bg-brand flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
          <Zap className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="font-semibold">Traductions incluses</p>
          <p className="text-xs text-muted-foreground">
            {data.used.toLocaleString("fr-FR")} / {limit.toLocaleString("fr-FR")} utilisées
          </p>
        </div>
        <span
          className={`text-sm font-semibold ${low ? "text-destructive" : "text-muted-foreground"}`}
        >
          {remaining.toLocaleString("fr-FR")}
        </span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary/60">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            low ? "bg-destructive" : "bg-brand"
          }`}
          style={{ width: `${ratio}%` }}
        />
      </div>

      {low ? (
        <Link
          to="/premium"
          className="bg-brand mt-3 flex h-11 items-center justify-center rounded-3xl text-sm font-semibold text-primary-foreground active:scale-[0.98]"
        >
          {remaining === 0 ? "Quota atteint — passer en Premium" : "Passer en Premium"}
        </Link>
      ) : null}
    </div>
  );
}
