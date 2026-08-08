import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export function PremiumUpsell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="glass rounded-3xl p-5">
      <span className="bg-brand mb-3 flex h-10 w-10 items-center justify-center rounded-2xl text-primary-foreground">
        <Sparkles className="h-4 w-4" />
      </span>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <Link
        to="/premium"
        className="bg-brand mt-4 flex h-12 items-center justify-center rounded-3xl text-sm font-semibold text-primary-foreground active:scale-[0.98]"
      >
        Découvrir Lingo Premium
      </Link>
    </div>
  );
}
