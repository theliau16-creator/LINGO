import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import {
  isTranslationStale,
  useConversationMessages,
  useConversationMeta,
  type MessageRow,
  type PendingMessage,
} from "@/lib/use-conversation-messages";
import { usePresence } from "@/lib/use-presence";
import { languageLabel } from "@/lib/languages";
import { Button } from "@/components/ui/button";

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
    <SafeAreaView className="flex-1 bg-background" edges={["bottom"]}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <Text className="text-[15px] font-semibold text-foreground">{title}</Text>
              <Text className="text-[11px] text-muted-foreground">
                {peerTyping
                  ? "écrit…"
                  : isGroup
                    ? `${others.length + 1} participants`
                    : peerOnline
                      ? "en ligne"
                      : `parle ${languageLabel(peer?.primary_language)}`}
              </Text>
            </View>
          ),
        }}
      />

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

        <View className="flex-row items-center gap-2 border-t border-border px-3 py-3">
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              notifyTyping();
            }}
            placeholder={`Écrire en ${languageLabel(myLanguage)}…`}
            placeholderTextColor="#9598a4"
            multiline
            className="max-h-28 flex-1 rounded-3xl border border-border bg-secondary px-4 py-3 text-[15px] text-foreground"
          />
          <Pressable
            onPress={handleSend}
            disabled={!draft.trim()}
            className={`h-12 w-12 items-center justify-center rounded-3xl bg-primary ${!draft.trim() ? "opacity-40" : ""}`}
          >
            <Text className="text-[18px] text-primary-foreground">➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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

  return (
    <View className={`flex-col ${mine ? "items-end" : "items-start"}`}>
      <View
        className={`max-w-[80%] rounded-3xl px-4 py-2.5 ${
          mine ? "rounded-br-lg bg-primary" : "rounded-bl-lg bg-card"
        }`}
      >
        {waiting ? (
          <View className="flex-row items-center gap-2 opacity-70">
            <ActivityIndicator size="small" color={mine ? "#fbfcfe" : "#9598a4"} />
            <Text className={`text-[15px] ${mine ? "text-primary-foreground" : "text-foreground"}`}>
              Traduction…
            </Text>
          </View>
        ) : (
          <Text className={`text-[15px] leading-snug ${mine ? "text-primary-foreground" : "text-foreground"}`}>
            {body}
          </Text>
        )}
      </View>

      <View className="mt-1 flex-row items-center gap-3 px-2">
        {translated ? (
          <Pressable onPress={() => setShowOriginal((v) => !v)}>
            <Text className="text-[11px] font-medium text-muted-foreground">
              {showOriginal ? "Voir la traduction" : "Voir l'original"}
            </Text>
          </Pressable>
        ) : null}
        {failed ? (
          <Pressable onPress={onRetryTranslation} className="flex-row items-center gap-1">
            <Text className="text-[11px] text-amber-400">↻ La traduction a échoué — réessayer</Text>
          </Pressable>
        ) : null}
      </View>
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
