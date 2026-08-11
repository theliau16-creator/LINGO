import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/use-profile";
import { useConversations, type ConversationRow } from "@/lib/use-conversations";
import { languageLabel } from "@/lib/languages";
import { timeAgo } from "@/lib/time-ago";
import { Button } from "@/components/ui/button";

export default function Chats() {
  const { session } = useAuth();
  const { profile } = useProfile();
  const myLanguage = profile?.primary_language ?? "fr";
  const [search, setSearch] = useState("");

  const { conversations, isLoading, isRefreshing, error, hasMore, loadMore, refetch } =
    useConversations(myLanguage);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const needle = search.toLowerCase();
    return conversations.filter(
      (row) =>
        row.peer?.username.toLowerCase().includes(needle) ||
        row.name?.toLowerCase().includes(needle) ||
        row.preview?.toLowerCase().includes(needle),
    );
  }, [conversations, search]);

  function openConversation(conversation: ConversationRow) {
    const title =
      conversation.type === "group" ? (conversation.name ?? "Groupe") : (conversation.peer?.username ?? "Lingo");
    router.push({ pathname: "/chat/[conversationId]", params: { conversationId: conversation.id, title } });
  }

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 px-4 pt-2">
        <Text className="mb-4 text-[22px] font-bold text-foreground">Discussions</Text>

        <View className="mb-3 flex-row items-center gap-2 rounded-3xl border border-border bg-secondary px-4 py-3">
          <Text className="text-muted-foreground">🔍</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher"
            placeholderTextColor="#9598a4"
            className="flex-1 text-[15px] text-foreground"
          />
        </View>

        {session?.user.id && !isLoading && !error ? (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetch} tintColor="#9598a4" />}
            ItemSeparatorComponent={() => <View className="h-2" />}
            ListEmptyComponent={<EmptyState />}
            ListFooterComponent={
              hasMore && filtered.length > 0 ? (
                <Pressable onPress={loadMore} className="mt-2 items-center rounded-2xl bg-secondary px-4 py-2.5">
                  <Text className="text-[13px] text-muted-foreground">Charger plus</Text>
                </Pressable>
              ) : null
            }
            renderItem={({ item }) => (
              <ConversationItem conversation={item} myLanguage={myLanguage} onPress={() => openConversation(item)} />
            )}
          />
        ) : isLoading ? (
          <SkeletonList />
        ) : error ? (
          <View className="mt-6 items-center rounded-3xl border border-border bg-card p-6">
            <Text className="mb-4 text-center text-[14px] text-muted-foreground">
              Impossible de charger les conversations.
            </Text>
            <Button label="Réessayer" variant="secondary" onPress={() => refetch()} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ConversationItem({
  conversation,
  myLanguage,
  onPress,
}: {
  conversation: ConversationRow;
  myLanguage: string;
  onPress: () => void;
}) {
  const isGroup = conversation.type === "group";
  const name = isGroup ? (conversation.name ?? "Groupe") : (conversation.peer?.username ?? "Lingo");

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-3xl border border-border bg-card p-3 active:opacity-80"
    >
      <View className="h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary">
        <Text className="text-[15px] font-bold text-primary-foreground">
          {isGroup ? "👥" : name.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text numberOfLines={1} className="flex-1 font-semibold text-foreground">
            {name}
          </Text>
          <Text className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(conversation.last_message_at)}</Text>
        </View>
        <Text numberOfLines={1} className="text-[13px] text-muted-foreground">
          {conversation.preview ?? "Dites bonjour 👋"}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-muted-foreground/80">
          {isGroup ? `${conversation.memberCount} participants` : `parle ${languageLabel(conversation.peer?.primary_language)}`}
        </Text>
      </View>
    </Pressable>
  );
}

function SkeletonList() {
  return (
    <View className="gap-2">
      {[0, 1, 2].map((index) => (
        <View key={index} className="h-[76px] animate-pulse rounded-3xl bg-card" />
      ))}
      <View className="mt-6 items-center">
        <ActivityIndicator color="#9598a4" />
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View className="mt-6 items-center rounded-3xl border border-border bg-card px-6 py-12">
      <Text className="text-[40px]">💬</Text>
      <Text className="mt-4 text-[16px] font-semibold text-foreground">Aucune conversation</Text>
      <Text className="mt-1 text-center text-[13px] text-muted-foreground">
        Ajoutez des amis pour commencer à discuter.
      </Text>
    </View>
  );
}
