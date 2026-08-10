import { useMutation } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Loader2, Palette, RotateCcw, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { BottomSheet } from "@/components/bottom-sheet";
import { PremiumUpsell } from "@/components/premium-upsell";
import { useCurrentUser } from "@/hooks/useAuth";
import { useChatPreferences } from "@/hooks/useChatPreferences";
import { useSubscription } from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import {
  BUBBLE_COLORS,
  CHAT_THEMES,
  GRADIENT_BACKGROUNDS,
  IMAGE_BACKGROUNDS,
  SOLID_BACKGROUNDS,
  backgroundStyle,
  haptic,
  readableTextColor,
  type ChatPreferences,
} from "@/lib/chat-theme";

type Tab = "theme" | "background" | "bubbles";

export function ChatCustomizer({
  open,
  onClose,
  conversationId,
  previewUrl,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  previewUrl: string | null;
}) {
  const { t } = useT();
  const { data: user } = useCurrentUser();
  const { preferences, save, reset } = useChatPreferences(conversationId);
  const subscription = useSubscription();
  const [tab, setTab] = useState<Tab>("theme");
  const [customTarget, setCustomTarget] = useState<"outgoing" | "incoming" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function apply(patch: Partial<ChatPreferences>, applyToAll = false) {
    haptic();
    save.mutate({ ...patch, applyToAll });
  }

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${user!.id}/${conversationId}-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("chat-backgrounds").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (error) throw error;
      return path;
    },
    onSuccess: (path) => apply({ background_type: "photo", background_value: path }),
    onError: (error) =>
      toast.error(t("media.importFailed"), {
        description: error instanceof Error ? error.message : t("media.retryLater"),
      }),
  });

  const outgoing = preferences.outgoing_message_color ?? "#3b82f6";
  const incoming = preferences.incoming_message_color ?? "#1f2937";

  if (!subscription.isLoading && !subscription.isPremium) {
    return (
      <BottomSheet open={open} onClose={onClose} title={t("media.customizeChat")}>
        <PremiumUpsell
          title={t("media.premiumTitle")}
          description={t("media.premiumDescription")}
        />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t("media.customizeChat")}>
      <div
        className="mb-4 space-y-2 rounded-3xl border border-border/40 p-4"
        style={backgroundStyle(preferences, previewUrl)}
      >
        <div className="flex justify-start">
          <span
            className="rounded-3xl rounded-bl-lg px-3.5 py-2 text-sm"
            style={{ background: incoming, color: readableTextColor(incoming) }}
          >
            {t("media.demoIncoming")}
          </span>
        </div>
        <div className="flex justify-end">
          <span
            className="rounded-3xl rounded-br-lg px-3.5 py-2 text-sm"
            style={{ background: outgoing, color: readableTextColor(outgoing) }}
          >
            {t("media.demoOutgoing")}
          </span>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(
          [
            { id: "theme", label: t("media.tabThemes"), icon: Sparkles },
            { id: "background", label: t("media.tabBackground"), icon: ImageIcon },
            { id: "bubbles", label: t("media.tabBubbles"), icon: Palette },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                haptic();
                setTab(item.id);
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-2.5 text-sm font-medium transition-all duration-300 ${
                tab === item.id
                  ? "bg-brand text-primary-foreground shadow-glow"
                  : "bg-secondary/60 text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === "theme" ? (
        <div className="grid grid-cols-2 gap-2">
          {CHAT_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() =>
                apply({
                  theme: theme.id,
                  background_type: theme.background.type,
                  background_value: theme.background.value,
                  outgoing_message_color: theme.outgoing,
                  incoming_message_color: theme.incoming,
                })
              }
              className={`relative overflow-hidden rounded-3xl p-4 text-left transition-transform duration-300 active:scale-95 ${
                preferences.theme === theme.id ? "ring-2 ring-primary" : ""
              }`}
              style={backgroundStyle(
                {
                  background_type: theme.background.type,
                  background_value: theme.background.value,
                  outgoing_message_color: null,
                  incoming_message_color: null,
                  theme: theme.id,
                },
                null,
              )}
            >
              <span className="flex gap-1">
                <span className="h-4 w-8 rounded-full" style={{ background: theme.outgoing }} />
                <span className="h-4 w-8 rounded-full" style={{ background: theme.incoming }} />
              </span>
              <span className="mt-6 block text-sm font-semibold text-white drop-shadow">
                {theme.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {tab === "background" ? (
        <div className="space-y-4">
          <Group title={t("media.solidColor")}>
            <div className="flex flex-wrap gap-2">
              {SOLID_BACKGROUNDS.map((color) => (
                <Swatch
                  key={color}
                  style={{ background: color }}
                  active={preferences.background_value === color && preferences.background_type === "solid"}
                  onClick={() => apply({ background_type: "solid", background_value: color })}
                />
              ))}
            </div>
          </Group>
          <Group title={t("media.gradients")}>
            <div className="flex flex-wrap gap-2">
              {GRADIENT_BACKGROUNDS.map((gradient) => (
                <Swatch
                  key={gradient}
                  style={{ backgroundImage: gradient }}
                  active={
                    preferences.background_value === gradient && preferences.background_type === "gradient"
                  }
                  onClick={() => apply({ background_type: "gradient", background_value: gradient })}
                />
              ))}
            </div>
          </Group>
          <Group title={t("media.lingoImages")}>
            <div className="grid grid-cols-4 gap-2">
              {IMAGE_BACKGROUNDS.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => apply({ background_type: "image", background_value: image.id })}
                  className={`h-16 rounded-2xl text-[10px] font-medium text-white/90 transition-transform active:scale-95 ${
                    preferences.background_value === image.id && preferences.background_type === "image"
                      ? "ring-2 ring-primary"
                      : ""
                  }`}
                  style={{ background: image.css }}
                >
                  {image.label}
                </button>
              ))}
            </div>
          </Group>
          <Group title={t("media.myPhoto")}>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload.mutate(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={upload.isPending}
              className="glass flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold active:scale-95 disabled:opacity-60"
            >
              {upload.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              {t("media.galleryOrCamera")}
            </button>
          </Group>
        </div>
      ) : null}

      {tab === "bubbles" ? (
        <div className="space-y-4">
          <Group title={t("media.myMessages")}>
            <ColorRow
              value={outgoing}
              onPick={(color) => apply({ outgoing_message_color: color })}
              onCustom={() => setCustomTarget(customTarget === "outgoing" ? null : "outgoing")}
            />
            {customTarget === "outgoing" ? (
              <div className="mt-3">
                <HexColorPicker
                  color={outgoing}
                  onChange={(color) => save.mutate({ outgoing_message_color: color })}
                  style={{ width: "100%" }}
                />
              </div>
            ) : null}
          </Group>
          <Group title={t("media.receivedMessages")}>
            <ColorRow
              value={incoming}
              onPick={(color) => apply({ incoming_message_color: color })}
              onCustom={() => setCustomTarget(customTarget === "incoming" ? null : "incoming")}
            />
            {customTarget === "incoming" ? (
              <div className="mt-3">
                <HexColorPicker
                  color={incoming}
                  onChange={(color) => save.mutate({ incoming_message_color: color })}
                  style={{ width: "100%" }}
                />
              </div>
            ) : null}
          </Group>
          <p className="px-1 text-xs text-muted-foreground">
            {t("media.textColorHint")}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => {
            haptic();
            reset.mutate();
          }}
          className="glass flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-muted-foreground active:scale-95"
        >
          <RotateCcw className="h-4 w-4" /> {t("media.reset")}
        </button>
        <button
          type="button"
          onClick={() => {
            apply({}, true);
            toast.success(t("media.appliedToAll"));
          }}
          className="bg-brand shadow-glow flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-primary-foreground active:scale-95"
        >
          <Check className="h-4 w-4" /> {t("media.applyAll")}
        </button>
      </div>
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Swatch({
  style,
  active,
  onClick,
}: {
  style: React.CSSProperties;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      aria-label={t("media.color")}
      className={`h-11 w-11 rounded-2xl transition-transform duration-300 active:scale-90 ${
        active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
      }`}
    />
  );
}

function ColorRow({
  value,
  onPick,
  onCustom,
}: {
  value: string;
  onPick: (color: string) => void;
  onCustom: () => void;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap gap-2">
      {BUBBLE_COLORS.map((color) => (
        <Swatch
          key={color.value}
          style={{ background: color.value }}
          active={value.toLowerCase() === color.value.toLowerCase()}
          onClick={() => onPick(color.value)}
        />
      ))}
      <button
        type="button"
        onClick={onCustom}
        aria-label={t("media.customColor")}
        className="h-11 w-11 rounded-2xl bg-[conic-gradient(from_0deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)] transition-transform active:scale-90"
      />
    </div>
  );
}
