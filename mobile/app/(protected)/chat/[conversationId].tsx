import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

/**
 * Confirms "ouverture d'une conversation" (Phase 2 requirement): tapping a
 * conversation in the list navigates here with its real id. The actual
 * message thread (history, send, translation, presence) is Phase 3 — this
 * stub only proves the navigation + id/title hand-off work end to end.
 */
export default function ChatDetail() {
  const { conversationId, title } = useLocalSearchParams<{ conversationId: string; title?: string }>();

  return (
    <View className="flex-1 items-center justify-center gap-2 bg-background px-8">
      <Stack.Screen options={{ title: title ?? "Conversation" }} />
      <Text className="text-[18px] font-semibold text-foreground">{title ?? "Conversation"}</Text>
      <Text className="text-center text-[13px] text-muted-foreground">
        Écran de conversation complet (messages, traduction, presence) — Phase 3.
      </Text>
      <Text className="mt-4 text-[11px] text-muted-foreground/60">id: {conversationId}</Text>
    </View>
  );
}
