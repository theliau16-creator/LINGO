import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Globe, MessagesSquare, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lingo — Messagerie traduite en temps réel" },
      {
        name: "description",
        content:
          "Écrivez dans votre langue, vos amis lisent dans la leur. Lingo traduit chaque message automatiquement, sans copier-coller.",
      },
      { property: "og:title", content: "Lingo — Messagerie traduite en temps réel" },
      {
        property: "og:description",
        content: "Deux langues, une conversation. La traduction devient invisible.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/chats", replace: true });
    });
  }, [navigate]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-between px-6 pt-16 pb-10">
      <div className="animate-rise">
        <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Traduction automatique et invisible
        </span>

        <h1 className="mt-8 text-6xl leading-[0.95] font-bold tracking-tight">
          Parlez
          <br />
          <span className="text-brand">sans barrière.</span>
        </h1>

        <p className="mt-6 max-w-sm text-lg leading-relaxed text-muted-foreground">
          Vous écrivez en français. Votre ami lit en espagnol. Personne ne copie-colle quoi que ce
          soit.
        </p>
      </div>

      <div className="my-12 space-y-3">
        <Bubble side="left" text="Bonjour, comment vas-tu ?" caption="Envoyé en français" />
        <Bubble side="right" text="Hola ¿Cómo estás?" caption="Reçu en espagnol" />
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Feature icon={Globe} label="20 langues" hint="Détection et traduction instantanées" />
          <Feature icon={MessagesSquare} label="Temps réel" hint="Messages livrés déjà traduits" />
        </div>

        <Link
          to="/auth"
          className="bg-brand shadow-glow flex h-14 w-full items-center justify-center rounded-3xl text-base font-semibold text-primary-foreground transition-transform duration-300 active:scale-[0.97]"
        >
          Commencer
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          Google, Apple ou e-mail — en quelques secondes.
        </p>
      </div>
    </div>
  );
}

function Bubble({
  side,
  text,
  caption,
}: {
  side: "left" | "right";
  text: string;
  caption: string;
}) {
  const mine = side === "right";
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"} animate-rise`}>
      <div
        className={`max-w-[78%] rounded-3xl px-5 py-3 text-[15px] ${
          mine
            ? "bg-brand shadow-glow rounded-br-lg text-primary-foreground"
            : "glass rounded-bl-lg text-foreground"
        }`}
      >
        {text}
      </div>
      <span className="mt-1.5 px-2 text-[11px] text-muted-foreground">{caption}</span>
    </div>
  );
}

function Feature({
  icon: Icon,
  label,
  hint,
}: {
  icon: typeof Globe;
  label: string;
  hint: string;
}) {
  return (
    <div className="glass rounded-3xl p-4">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-3 text-sm font-semibold">{label}</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}
