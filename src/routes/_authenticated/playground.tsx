import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, Bug, Loader2, RotateCcw, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Avatar } from "@/components/app-shell";
import { QuotaCard } from "@/components/quota-card";
import { useProfile } from "@/hooks/useAuth";
import { useDeveloperMode } from "@/hooks/useDeveloperMode";
import { isQuotaError, useTranslationQuota } from "@/hooks/useTranslationQuota";
import { haptic } from "@/lib/chat-theme";
import { languageFlag, languageName } from "@/lib/languages";
import { SCENARIOS, TEST_PROFILES } from "@/lib/playground-scenarios";
import { playgroundTranslate } from "@/lib/playground.functions";

export const Route = createFileRoute("/_authenticated/playground")({
  head: () => ({
    meta: [
      { title: "Translation Playground — Lingo" },
      {
        name: "description",
        content: "Testez la traduction en direct entre deux langues avec des profils de test.",
      },
      { property: "og:title", content: "Translation Playground — Lingo" },
      {
        property: "og:description",
        content: "Simulez une conversation multilingue et inspectez chaque traduction.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlaygroundPage,
});

type Debug = {
  originalText: string;
  detectedLanguage: string;
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string | null;
  engine: string;
  durationMs: number;
  status: string;
  error: string | null;
  estimatedCost: number;
};

type PlaygroundMessage = {
  id: string;
  side: "me" | "them";
  sourceLanguage: string;
  targetLanguage: string;
  original: string;
  translated: string;
  debug: Debug | null;
};

function PlaygroundPage() {
  const { data: profile } = useProfile();
  const translate = useServerFn(playgroundTranslate);
  const developer = useDeveloperMode();
  const quota = useTranslationQuota();

  const [partnerId, setPartnerId] = useState<string>("ja");
  const [pov, setPov] = useState<"me" | "them">("me");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<PlaygroundMessage[]>([]);
  const [showDebugFor, setShowDebugFor] = useState<string | null>(null);

  const partner = useMemo(
    () => TEST_PROFILES.find((p) => p.id === partnerId) ?? TEST_PROFILES[0]!,
    [partnerId],
  );
  const myLanguage = profile?.primary_language ?? "fr";
  const myName = profile?.username ?? "Moi";

  const speaker = pov === "me"
    ? { name: myName, language: myLanguage }
    : { name: partner.name, language: partner.language };
  const listener = pov === "me"
    ? { name: partner.name, language: partner.language }
    : { name: myName, language: myLanguage };

  const send = useMutation({
    mutationFn: async (text: string) => {
      const result = (await translate({
        data: {
          text,
          sourceLanguage: speaker.language,
          targetLanguage: listener.language,
        },
      })) as Debug;
      return result;
    },
    onSuccess: (result) => {
      haptic();
      void quota.refetch();
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          side: pov,
          sourceLanguage: result.sourceLanguage,
          targetLanguage: result.targetLanguage,
          original: result.originalText,
          translated: result.translatedText ?? "",
          debug: result,
        },
      ]);
    },
    onError: (error) =>
      toast.error(isQuotaError(error) ? "Quota atteint" : "Traduction impossible", {
        description: isQuotaError(error)
          ? "Vos 5 000 traductions gratuites sont utilisées. Passez en Premium pour continuer."
          : error instanceof Error
            ? error.message
            : "Réessayez.",
      }),
  });

  const runScenario = useMutation({
    mutationFn: async (scenarioId: string) => {
      const scenario = SCENARIOS.find((item) => item.id === scenarioId);
      if (!scenario) return;
      setMessages([]);
      for (const turn of scenario.turns) {
        const from = turn.from === "me"
          ? { language: myLanguage, side: "me" as const }
          : { language: partner.language, side: "them" as const };
        const to = turn.from === "me" ? partner.language : myLanguage;

        let original = turn.text;
        if (from.language !== "fr") {
          const localised = (await translate({
            data: { text: turn.text, sourceLanguage: "fr", targetLanguage: from.language },
          })) as Debug;
          original = localised.translatedText ?? turn.text;
        }

        const result = (await translate({
          data: { text: original, sourceLanguage: from.language, targetLanguage: to },
        })) as Debug;

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            side: from.side,
            sourceLanguage: from.language,
            targetLanguage: to,
            original,
            translated: result.translatedText ?? "",
            debug: result,
          },
        ]);
      }
    },
    onError: (error) =>
      toast.error(isQuotaError(error) ? "Quota atteint" : "Scénario interrompu", {
        description: isQuotaError(error)
          ? "Vos 5 000 traductions gratuites sont utilisées. Passez en Premium pour continuer."
          : error instanceof Error
            ? error.message
            : "Réessayez.",
      }),
  });

  return (
    <AppShell
      title="Playground"
      subtitle="Testez la traduction sans deuxième appareil"
      action={
        <button
          type="button"
          onClick={() => {
            haptic();
            setPov(pov === "me" ? "them" : "me");
          }}
          className="glass flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold active:scale-[0.97]"
        >
          <ArrowLeftRight className="h-4 w-4" /> Point de vue
        </button>
      }
    >
      <div className="mb-5">
        <QuotaCard />
      </div>

      <section className="mb-5">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Profil de test
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {TEST_PROFILES.map((item) => {
            const active = item.id === partnerId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPartnerId(item.id);
                  setMessages([]);
                }}
                className={`glass flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-xs transition-all duration-300 active:scale-[0.97] ${
                  active ? "ring-2 ring-primary/60" : ""
                }`}
              >
                <span className="text-base">{languageFlag(item.language)}</span>
                <span className="font-semibold">{languageName(item.language)}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="glass mb-5 flex items-center justify-between rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <Avatar name={speaker.name} size={40} ring />
          <div>
            <p className="text-[11px] tracking-widest text-muted-foreground uppercase">
              Vous écrivez en tant que
            </p>
            <p className="text-sm font-semibold">
              {speaker.name} · {languageFlag(speaker.language)} {languageName(speaker.language)}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] tracking-widest text-muted-foreground uppercase">Vers</p>
          <p className="text-sm font-semibold">
            {languageFlag(listener.language)} {languageName(listener.language)}
          </p>
        </div>
      </div>

      <section className="mb-5">
        <h2 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
          Conversation simulée
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              disabled={runScenario.isPending}
              onClick={() => runScenario.mutate(scenario.id)}
              className="glass flex shrink-0 items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition-all duration-300 active:scale-[0.97] disabled:opacity-50"
            >
              <span>{scenario.emoji}</span> {scenario.label}
            </button>
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {runScenario.isPending ? (
          <p className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Génération du scénario…
          </p>
        ) : null}

        {messages.length === 0 && !runScenario.isPending ? (
          <div className="glass animate-rise rounded-3xl p-6 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-3 h-5 w-5 text-primary" />
            Écrivez un message ou lancez un scénario pour voir la traduction dans les deux sens.
          </div>
        ) : null}

        {messages.map((message) => {
          const mine = message.side === pov;
          return (
            <div
              key={message.id}
              className={`animate-rise flex flex-col ${mine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-3xl px-4 py-3 text-[15px] ${
                  mine ? "bg-brand text-primary-foreground" : "glass"
                }`}
              >
                <p>{mine ? message.original : message.translated || message.original}</p>
                <p
                  className={`mt-1 text-[11px] ${
                    mine ? "text-primary-foreground/70" : "text-muted-foreground"
                  }`}
                >
                  {mine
                    ? `${languageFlag(message.sourceLanguage)} → ${languageFlag(message.targetLanguage)}`
                    : `${languageFlag(message.sourceLanguage)} ${message.original}`}
                </p>
              </div>

              {developer.enabled && message.debug ? (
                <button
                  type="button"
                  onClick={() =>
                    setShowDebugFor(showDebugFor === message.id ? null : message.id)
                  }
                  className="mt-1 flex items-center gap-1 px-2 text-[11px] text-muted-foreground"
                >
                  <Bug className="h-3 w-3" /> Debug
                </button>
              ) : null}

              {developer.enabled && showDebugFor === message.id && message.debug ? (
                <pre className="glass mt-1 max-w-full overflow-x-auto rounded-2xl p-3 text-[11px] leading-5 text-muted-foreground">
{`texte original: ${message.debug.originalText}
langue détectée : ${message.debug.detectedLanguage}
langue cible    : ${message.debug.targetLanguage}
traduction      : ${message.debug.translatedText ?? "—"}
moteur          : ${message.debug.engine}
temps           : ${message.debug.durationMs} ms
statut          : ${message.debug.status}
erreur          : ${message.debug.error ?? "aucune"}
coût estimé     : $${message.debug.estimatedCost}`}
                </pre>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="safe-bottom sticky bottom-24 mt-6">
        <div className="glass-strong flex items-center gap-2 rounded-3xl p-2">
          <button
            type="button"
            onClick={() => setMessages([])}
            aria-label="Effacer la conversation"
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-muted-foreground"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft.trim()) {
                send.mutate(draft.trim());
                setDraft("");
              }
            }}
            placeholder={`Écrire en ${languageName(speaker.language)}…`}
            className="w-full bg-transparent px-2 text-[15px] outline-none placeholder:text-muted-foreground/60"
          />
          <button
            type="button"
            disabled={send.isPending || !draft.trim()}
            onClick={() => {
              send.mutate(draft.trim());
              setDraft("");
            }}
            className="bg-brand shadow-glow flex h-11 w-11 items-center justify-center rounded-2xl text-primary-foreground disabled:opacity-50"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
