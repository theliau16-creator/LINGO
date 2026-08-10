import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Languages, SendHorizonal, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  getGuestConversation,
  getInvitePreview,
  joinConversationAsGuest,
  sendGuestMessage,
} from "@/lib/invites.functions";
import { LANGUAGES } from "@/lib/languages";
import { translateWith, useLocale, useT, type TFunction } from "@/lib/i18n";

export const Route = createFileRoute("/join/$code")({
  head: () => ({
    meta: [
      { title: translateWith(null, "invite.pageTitle") },
      {
        name: "description",
        content: translateWith(null, "invite.pageDescription"),
      },
      { property: "og:title", content: translateWith(null, "invite.pageTitle") },
      {
        property: "og:description",
        content: translateWith(null, "invite.ogDescription"),
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JoinPage,
});

const INVITE_ERROR_KEYS = {
  INVITE_NOT_FOUND: "invite.errorNotFound",
  INVITE_EXPIRED: "invite.errorExpired",
  INVITE_REVOKED: "invite.errorRevoked",
  INVITE_EXHAUSTED: "invite.errorExhausted",
  GUEST_SESSION_INVALID: "invite.errorSessionInvalid",
} as const;

function humanError(error: unknown, t: TFunction): string {
  const message = error instanceof Error ? error.message : "";
  for (const [key, label] of Object.entries(INVITE_ERROR_KEYS)) {
    if (message.includes(key)) return t(label as Parameters<TFunction>[0]);
  }
  return message || t("invite.errorGeneric");
}

function storageKey(code: string) {
  return `lingo_guest_${code}`;
}

function guessLanguage(): string {
  if (typeof navigator === "undefined") return "fr";
  const code = navigator.language.slice(0, 2).toLowerCase();
  return LANGUAGES.some((language) => language.code === code) ? code : "en";
}

function JoinPage() {
  const { code } = Route.useParams();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(localStorage.getItem(storageKey(code)));
  }, [code]);

  if (token) {
    return (
      <GuestChat
        code={code}
        token={token}
        onExpired={() => {
          localStorage.removeItem(storageKey(code));
          setToken(null);
        }}
      />
    );
  }

  return (
    <JoinForm
      code={code}
      onJoined={(value) => {
        localStorage.setItem(storageKey(code), value);
        setToken(value);
      }}
    />
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: (token: string) => void }) {
  const { t } = useT();
  const { setLocale } = useLocale();
  const [displayName, setDisplayName] = useState("");
  const [language, setLanguage] = useState(guessLanguage);

  const preview = useQuery({
    queryKey: ["invite", code],
    retry: false,
    queryFn: () => getInvitePreview({ data: { code } }),
  });

  const join = useMutation({
    mutationFn: () =>
      joinConversationAsGuest({ data: { code, displayName, language } }),
    onSuccess: (result) => onJoined(result.token),
    onError: (error) => toast.error(humanError(error, t)),
  });

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-5 py-10">
      <div className="glass-strong rounded-[2rem] p-6">
        {preview.isLoading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("invite.checkingInvite")}
          </div>
        ) : preview.isError ? (
          <div className="space-y-3 text-center">
            <h1 className="text-xl font-bold">{t("invite.unavailableTitle")}</h1>
            <p className="text-sm text-muted-foreground">{humanError(preview.error, t)}</p>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/15 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-bold">
                {t("invite.invitesYou", { username: preview.data?.inviter.username ?? "" })}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("invite.joinIntro")}</p>
            </div>

            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="guest-name">
              {t("invite.yourFirstName")}
            </label>
            <input
              id="guest-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
              placeholder={t("invite.firstNamePlaceholder")}
              className="glass mb-4 w-full rounded-2xl px-4 py-3 text-sm outline-none"
            />

            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="guest-language">
              {t("invite.yourLanguage")}
            </label>
            <select
              id="guest-language"
              value={language}
              onChange={(event) => {
                const next = event.target.value;
                setLanguage(next);
                setLocale(next);
              }}
              className="glass mb-6 w-full rounded-2xl bg-transparent px-4 py-3 text-sm outline-none"
            >
              {LANGUAGES.map((item) => (
                <option key={item.code} value={item.code} className="bg-background">
                  {item.flag} {item.native}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={!displayName.trim() || join.isPending}
              onClick={() => join.mutate()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {join.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t("invite.joinConversation")}
            </button>
          </>
        )}
      </div>
    </main>
  );
}

function GuestChat({
  code,
  token,
  onExpired,
}: {
  code: string;
  token: string;
  onExpired: () => void;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [showOriginal, setShowOriginal] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversation = useQuery({
    queryKey: ["guest-conversation", code],
    retry: false,
    refetchInterval: 5000,
    queryFn: () => getGuestConversation({ data: { token } }),
  });

  useEffect(() => {
    if (
      conversation.isError &&
      humanError(conversation.error, t) === t("invite.errorSessionInvalid")
    ) {
      onExpired();
    }
  }, [conversation.isError, conversation.error, onExpired, t]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation.data?.messages.length]);

  const send = useMutation({
    mutationFn: (value: string) => sendGuestMessage({ data: { token, text: value } }),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["guest-conversation", code] });
    },
    onError: (error) => toast.error(humanError(error, t)),
  });

  const guestLanguage = useMemo(
    () => LANGUAGES.find((item) => item.code === conversation.data?.guest.language),
    [conversation.data?.guest.language],
  );

  return (
    <main className="mx-auto flex h-dvh w-full max-w-lg flex-col">
      <header className="glass-strong flex items-center justify-between px-5 py-4">
        <div>
          <h1 className="text-base font-bold">{t("invite.chatTitle")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("invite.readingIn", {
              language: guestLanguage?.native ?? conversation.data?.guest.language ?? "",
            })}
          </p>
        </div>
        <Languages className="h-5 w-5 text-primary" />
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {conversation.isLoading ? (
          <div className="flex justify-center pt-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : conversation.isError ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">
            {humanError(conversation.error, t)}
          </p>
        ) : conversation.data?.messages.length === 0 ? (
          <p className="pt-10 text-center text-sm text-muted-foreground">{t("invite.sayHello")}</p>
        ) : (
          conversation.data?.messages.map((message) => {
            const original = showOriginal[message.id];
            const body = original
              ? message.original_text
              : (message.translated_text ?? message.original_text);
            return (
              <div
                key={message.id}
                className={`flex flex-col ${message.mine ? "items-end" : "items-start"}`}
              >
                {!message.mine ? (
                  <span className="mb-1 px-2 text-[11px] text-muted-foreground">
                    {message.author}
                  </span>
                ) : null}
                <div
                  className={`max-w-[80%] rounded-3xl px-4 py-2.5 text-sm ${
                    message.mine ? "bg-primary text-primary-foreground" : "glass"
                  }`}
                >
                  {message.attachments.map((attachment) =>
                    attachment.type === "audio" ? (
                      <audio key={attachment.path} controls src={attachment.url ?? undefined} className="mb-2 w-56" />
                    ) : (
                      <img
                        key={attachment.path}
                        src={attachment.url ?? ""}
                        alt={t("invite.attachmentAlt")}
                        loading="lazy"
                        className="mb-2 max-h-64 rounded-2xl object-cover"
                      />
                    ),
                  )}
                  {body ? <p className="whitespace-pre-wrap break-words">{body}</p> : null}
                </div>
                {message.translated_text && message.translated_text !== message.original_text ? (
                  <button
                    type="button"
                    onClick={() =>
                      setShowOriginal((state) => ({ ...state, [message.id]: !state[message.id] }))
                    }
                    className="mt-1 px-2 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    {original ? t("invite.viewTranslation") : t("invite.viewOriginal")}
                  </button>
                ) : null}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="glass-strong flex items-center gap-2 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) send.mutate(text);
        }}
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("invite.messagePlaceholder")}
          maxLength={2000}
          aria-label={t("invite.messageAriaLabel")}
          className="glass flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={!text.trim() || send.isPending}
          aria-label={t("invite.sendAriaLabel")}
          className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-50"
        >
          {send.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizonal className="h-4 w-4" />
          )}
        </button>
      </form>
    </main>
  );
}
