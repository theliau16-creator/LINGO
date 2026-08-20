import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";
import { Search, UserPlus } from "lucide-react-native";
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
      <Svg
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }}
        viewBox="0 0 402 340"
      >
        <Defs>
          <RadialGradient id="haloLeft" cx="48" cy="-34" r="360" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#337bff" stopOpacity={0.26} />
            <Stop offset="0.2" stopColor="#337bff" stopOpacity={0.16} />
            <Stop offset="0.35" stopColor="#337bff" stopOpacity={0.08} />
            <Stop offset="0.5" stopColor="#337bff" stopOpacity={0.03} />
            <Stop offset="0.58" stopColor="#337bff" stopOpacity={0} />
            <Stop offset="1" stopColor="#337bff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="haloRight" cx="382" cy="27" r="340" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#aa6ef3" stopOpacity={0.22} />
            <Stop offset="0.2" stopColor="#aa6ef3" stopOpacity={0.14} />
            <Stop offset="0.35" stopColor="#aa6ef3" stopOpacity={0.07} />
            <Stop offset="0.5" stopColor="#aa6ef3" stopOpacity={0.025} />
            <Stop offset="0.6" stopColor="#aa6ef3" stopOpacity={0} />
            <Stop offset="1" stopColor="#aa6ef3" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="402" height="340" fill="url(#haloLeft)" />
        <Rect x="0" y="0" width="402" height="340" fill="url(#haloRight)" />
      </Svg>
      <View className="flex-1 px-4 pb-24 pt-1">
        <View className="mb-3 flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[30px] font-bold leading-9 tracking-[-0.75px] text-foreground">Discussions</Text>
            <Text className="mt-1 text-[14px] leading-5 text-muted-foreground">
              Chaque message arrive dans votre langue
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/friends")}
            className="h-11 w-11 items-center justify-center rounded-2xl active:opacity-80"
            style={{
              backgroundColor: "#6e74f9",
              shadowColor: "#337bff",
              shadowOpacity: 0.6,
              shadowRadius: 14,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            }}
          >
            <UserPlus size={20} color="#fbfcfe" />
          </Pressable>
        </View>

        <BlurView
          intensity={45}
          tint="dark"
          style={{
            marginBottom: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 40,
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            paddingHorizontal: 16,
            paddingVertical: 12,
            overflow: "hidden",
          }}
        >
          <Search size={16} color="#9598a4" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Rechercher une conversation"
            placeholderTextColor="#9598a4"
            className="flex-1 text-[15px] text-foreground"
          />
        </BlurView>

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
  const avatarUrl = isGroup ? conversation.avatar_url : conversation.peer?.avatar_url;

  return (
    <Pressable
      onPress={onPress}
      className="overflow-hidden rounded-3xl active:opacity-80"
      style={{ borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}
    >
      <BlurView intensity={25} tint="dark" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      <View className="flex-row items-center gap-3 p-3">
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} className="h-12 w-12 shrink-0 rounded-full bg-primary" />
      ) : (
        <View className="h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <Svg width={48} height={48} style={{ position: "absolute" }}>
            <Defs>
              <LinearGradient id="avatarBrand" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#337bff" />
                <Stop offset="1" stopColor="#aa6ef3" />
              </LinearGradient>
            </Defs>
            <Rect width="48" height="48" fill="url(#avatarBrand)" />
          </Svg>
          <Text className="text-[15px] font-bold text-primary-foreground">
            {isGroup ? "👥" : name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}
      <View className="min-w-0 flex-1">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text numberOfLines={1} className="flex-1 font-semibold text-foreground">
            {name}
          </Text>
          <Text className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(conversation.last_message_at)}</Text>
        </View>
        <Text numberOfLines={1} className="text-[14px] text-muted-foreground">
          {conversation.preview ?? "Dites bonjour 👋"}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[11px] text-muted-foreground/80">
          {isGroup ? `${conversation.memberCount} participants` : `parle ${languageLabel(conversation.peer?.primary_language)}`}
        </Text>
      </View>
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
