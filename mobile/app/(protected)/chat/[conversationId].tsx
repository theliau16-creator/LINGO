import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { ArrowLeft, BrainCircuit, Palette, RefreshCw, SendHorizontal, UserPlus } from "lucide-react-native";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import {
  isTranslationStale,
  QUOTA_REACHED,
  useConversationMessages,
  useConversationMeta,
  type MessageRow,
  type PendingMessage,
} from "@/lib/use-conversation-messages";
import { usePresence } from "@/lib/use-presence";
import { languageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";
import { MediaComposer } from "@/components/media-composer";
import { MessageAttachments } from "@/components/message-attachments";

export default function ChatDetail() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { session } = useAuth();
  const { profile } = useProfile();
  const myLanguage = profile?.primary_language ?? "fr";
  const userId = session?.user.id ?? null;

  const { meta } = useConversationMeta(conversationId);
  const {
    messages,
    pending,
    byId,
    isLoading,
    error,
    hasMore,
    loadMore,
    refetch,
    send,
    retrySend,
    retryTranslation,
  } = useConversationMessages(conversationId);
  const { peerOnline, peerTyping, notifyTyping } = usePresence({
    conversationId,
    userId,
    shareStatus: true,
  });

  const others = useMemo(() => (meta?.members ?? []).filter((m) => m.id !== userId), [meta, userId]);
  const isGroup = meta?.type === "group" || others.length > 1;
  const peer = others[0] ?? null;
  const title = isGroup ? (meta?.name ?? "Groupe") : (peer?.username ?? "Lingo");
  const avatarUrl = isGroup ? meta?.avatar_url : peer?.avatar_url;

  const [draft, setDraft] = useState("");
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length, pending.length]);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text, myLanguage);
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <Svg
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 460 }}
        viewBox="0 0 402 460"
      >
        <Defs>
          <RadialGradient id="chatHaloLeft" cx="48" cy="-34" r="360" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#337bff" stopOpacity={0.26} />
            <Stop offset="0.2" stopColor="#337bff" stopOpacity={0.16} />
            <Stop offset="0.35" stopColor="#337bff" stopOpacity={0.08} />
            <Stop offset="0.5" stopColor="#337bff" stopOpacity={0.03} />
            <Stop offset="0.58" stopColor="#337bff" stopOpacity={0} />
            <Stop offset="1" stopColor="#337bff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="chatHaloRight" cx="382" cy="27" r="340" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#aa6ef3" stopOpacity={0.22} />
            <Stop offset="0.2" stopColor="#aa6ef3" stopOpacity={0.14} />
            <Stop offset="0.35" stopColor="#aa6ef3" stopOpacity={0.07} />
            <Stop offset="0.5" stopColor="#aa6ef3" stopOpacity={0.025} />
            <Stop offset="0.6" stopColor="#aa6ef3" stopOpacity={0} />
            <Stop offset="1" stopColor="#aa6ef3" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="402" height="460" fill="url(#chatHaloLeft)" />
        <Rect x="0" y="0" width="402" height="460" fill="url(#chatHaloRight)" />
      </Svg>

      <BlurView
        intensity={70}
        tint="dark"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.10)",
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
      >
        <Pressable
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-2xl active:opacity-70"
        >
          <ArrowLeft size={20} color="#9598a4" />
        </Pressable>

        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} className="h-10 w-10 rounded-full bg-primary" />
        ) : (
          <View className="h-10 w-10 items-center justify-center overflow-hidden rounded-full">
            <Svg width={40} height={40} style={{ position: "absolute" }}>
              <Defs>
                <LinearGradient id="headerAvatarBrand" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor="#337bff" />
                  <Stop offset="1" stopColor="#aa6ef3" />
                </LinearGradient>
              </Defs>
              <Rect width="40" height="40" fill="url(#headerAvatarBrand)" />
            </Svg>
            <Text className="text-[14px] font-bold text-primary-foreground">
              {title.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}

        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-semibold text-foreground">
            {title}
          </Text>
          <Text numberOfLines={1} className="text-[11px] text-muted-foreground">
            {peerTyping ? (
              "écrit…"
            ) : isGroup ? (
              `${others.length + 1} participants`
            ) : peerOnline ? (
              <Text className="text-emerald-400">en ligne</Text>
            ) : (
              `parle ${languageLabel(peer?.primary_language)}`
            )}
          </Text>
        </View>

        {!isGroup ? (
          <View className="flex-row items-center gap-2">
            {[UserPlus, BrainCircuit, Palette].map((Icon, index) => (
              <View
                key={index}
                style={{
                  height: 36,
                  width: 36,
                  borderRadius: 32,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Icon size={16} color="#9598a4" />
              </View>
            ))}
          </View>
        ) : null}
      </BlurView>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#9598a4" />
          </View>
        ) : error ? (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-center text-[14px] text-muted-foreground">
              Impossible de charger la conversation.
            </Text>
            <Button label="Réessayer" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerClassName="gap-2 px-4 py-4"
            ListHeaderComponent={
              hasMore ? (
                <Pressable onPress={loadMore} className="mb-2 items-center rounded-2xl bg-secondary px-4 py-2">
                  <Text className="text-[12px] text-muted-foreground">Charger les messages précédents</Text>
                </Pressable>
              ) : null
            }
            ListEmptyComponent={
              pending.length === 0 ? (
                <View className="mt-10 items-center px-6">
                  <Text className="text-center text-[14px] text-muted-foreground">
                    Dites bonjour — votre message sera traduit automatiquement.
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                mine={item.sender_id === userId}
                myLanguage={myLanguage}
                onRetryTranslation={() => void retryTranslation(item.id).catch(() => undefined)}
              />
            )}
            ListFooterComponent={
              pending.length > 0 ? (
                <View className="gap-2">
                  {pending.map((item) => (
                    <PendingBubble key={item.localId} item={item} onRetry={() => retrySend(item.localId)} />
                  ))}
                </View>
              ) : null
            }
          />
        )}

        <BlurView
          intensity={70}
          tint="dark"
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 12,
            borderTopWidth: 1,
            borderTopColor: "rgba(255,255,255,0.10)",
            backgroundColor: "rgba(255,255,255,0.06)",
          }}
        >
          <MediaComposer conversationId={conversationId} language={myLanguage} onSent={() => void refetch()} />
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              notifyTyping();
            }}
            placeholder={`Écrire en ${languageLabel(myLanguage)}…`}
            placeholderTextColor="#9598a4"
            multiline
            style={{
              height: 48,
              borderRadius: 40,
              paddingHorizontal: 16,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
            }}
            className="flex-1 text-[15px] text-foreground"
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim()}
            className={`h-12 w-12 items-center justify-center rounded-3xl ${!draft.trim() ? "opacity-40" : ""}`}
            style={{
              backgroundColor: "#6e74f9",
              shadowColor: "#337bff",
              shadowOpacity: 0.6,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
          >
            <SendHorizontal size={20} color="#fbfcfe" />
          </Pressable>
        </BlurView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function HeaderAction({ Icon }: { Icon: typeof UserPlus }) {
  return (
    <BlurView
      intensity={45}
      tint="dark"
      style={{
        height: 36,
        width: 36,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <Icon size={16} color="#9598a4" />
    </BlurView>
  );
}

function MessageBubble({
  message,
  mine,
  myLanguage,
  onRetryTranslation,
}: {
  message: MessageRow;
  mine: boolean;
  myLanguage: string;
  onRetryTranslation: () => void;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const translation = message.message_translations.find((item) => item.language === myLanguage);
  const translated = !mine && Boolean(translation) && message.source_language !== myLanguage;
  const body = translated && !showOriginal ? translation!.translated_text : message.original_text;
  const stale = isTranslationStale(message);
  const waiting =
    !mine && !translation && message.source_language !== myLanguage && message.translation_status !== "failed" && !stale;
  const failed = message.translation_status === "failed" || stale;
  // Quota exhaustion is not transient: the backend already refused (assertQuota
  // in quota.server.ts), so a plain "retry" would fail again identically —
  // send the user to the paywall instead of a dead-end retry button.
  const quotaReached = message.translation_status === "failed" && message.translation_error === QUOTA_REACHED;

  // Photo captions and voice transcripts are optional/deferred: a photo with
  // no caption is "done" with an empty original_text, and a voice note's
  // original_text stays empty until transcribeVoiceMessage fills it in — the
  // text block (and its waiting/failed state, which describes the CAPTION's
  // translation, not the transcription itself) only makes sense once there
  // is text to translate.
  const hasText = message.original_text.trim().length > 0;
  const showTextBlock = message.message_type === "text" || hasText;

  return (
    <View className={`flex-col ${mine ? "items-end" : "items-start"}`}>
      {message.attachments?.length ? (
        <View className={`max-w-[80%] ${mine ? "items-end" : "items-start"}`}>
          <MessageAttachments attachments={message.attachments} messageId={message.id} mine={mine} />
        </View>
      ) : null}

      {showTextBlock ? (
        <>
          {mine ? (
            <View
              className="max-w-[80%] rounded-3xl px-4 py-2.5"
              style={{
                borderBottomRightRadius: 16,
                backgroundColor: "#6e74f9",
                shadowColor: "#337bff",
                shadowOpacity: 0.6,
                shadowRadius: 14,
                shadowOffset: { width: 0, height: 6 },
                elevation: 6,
              }}
            >
              {waiting ? (
                <View className="flex-row items-center gap-2 opacity-70">
                  <ActivityIndicator size="small" color="#fbfcfe" />
                  <Text className="text-[15px] text-primary-foreground">Traduction…</Text>
                </View>
              ) : (
                <Text className="text-[15px] leading-snug text-primary-foreground">{body}</Text>
              )}
            </View>
          ) : (
            <BlurView
              intensity={35}
              tint="dark"
              style={{
                maxWidth: "80%",
                borderRadius: 40,
                borderBottomLeftRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.10)",
                overflow: "hidden",
              }}
            >
              {waiting ? (
                <View className="flex-row items-center gap-2 opacity-70">
                  <ActivityIndicator size="small" color="#9598a4" />
                  <Text className="text-[15px] text-foreground">Traduction…</Text>
                </View>
              ) : (
                <Text className="text-[15px] leading-snug text-foreground">{body}</Text>
              )}
            </BlurView>
          )}

          <View className="mt-1 flex-row items-center gap-3 px-2">
            {translated ? (
              <Pressable onPress={() => setShowOriginal((v) => !v)}>
                <Text className="text-[11px] font-medium text-muted-foreground">
                  {showOriginal ? "Voir la traduction" : "Voir l'original"}
                </Text>
              </Pressable>
            ) : null}
            {quotaReached ? (
              <Pressable onPress={() => router.push("/premium")} className="flex-row items-center gap-1">
                <Text className="text-[11px] text-amber-400">
                  Quota de traductions gratuites atteint — passer à Premium
                </Text>
              </Pressable>
            ) : failed ? (
              <Pressable onPress={onRetryTranslation} className="flex-row items-center gap-1">
                <RefreshCw size={12} color="#fbbf24" />
                <Text className="text-[11px] text-amber-400">La traduction a échoué — réessayer</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

function PendingBubble({ item, onRetry }: { item: PendingMessage; onRetry: () => void }) {
  return (
    <View className="items-end">
      <View className="max-w-[80%] rounded-3xl rounded-br-lg bg-primary px-4 py-2.5 opacity-60">
        <Text className="text-[15px] text-primary-foreground">{item.text}</Text>
      </View>
      {item.failed ? (
        <Pressable onPress={onRetry} className="mt-1 px-2">
          <Text className="text-[11px] text-destructive">Échec de l'envoi — toucher pour réessayer</Text>
        </Pressable>
      ) : (
        <Text className="mt-1 px-2 text-[11px] text-muted-foreground">Envoi…</Text>
      )}
    </View>
  );
}
