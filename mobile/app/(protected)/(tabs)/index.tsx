import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Placeholder — real conversation list lands in Phase 2. */
export default function Chats() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 items-center justify-center gap-2 px-8">
        <Text className="text-[40px]">💬</Text>
        <Text className="text-[18px] font-semibold text-foreground">Discussions</Text>
        <Text className="text-center text-[14px] text-muted-foreground">
          La liste de vos conversations arrive dans la prochaine phase.
        </Text>
      </View>
    </SafeAreaView>
  );
}
