import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/** Placeholder — real friends list/search lands in Phase 5. */
export default function Friends() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <View className="flex-1 items-center justify-center gap-2 px-8">
        <Text className="text-[40px]">👥</Text>
        <Text className="text-[18px] font-semibold text-foreground">Amis</Text>
        <Text className="text-center text-[14px] text-muted-foreground">
          Recherche et demandes d'ami arrivent dans une prochaine phase.
        </Text>
      </View>
    </SafeAreaView>
  );
}
