import { Tabs } from "expo-router";
import { View } from "react-native";
import { BlurView } from "expo-blur";
import { MessageCircle, Settings, User, Users } from "lucide-react-native";
import type { ComponentType } from "react";

/**
 * Bottom-tab shell equivalent to the web's app-shell.tsx BottomNav —
 * floating glass dock, active tab gets a filled icon chip.
 */
function TabIcon({
  Icon,
  focused,
}: {
  Icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  focused: boolean;
}) {
  return (
    <View
      style={{
        height: 36,
        width: 36,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? "#6e74f9" : "transparent",
      }}
    >
      <Icon size={18} strokeWidth={2.2} color={focused ? "#fbfcfe" : "#9598a4"} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#f7f8fb",
        tabBarInactiveTintColor: "#9598a4",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        tabBarItemStyle: { flex: 1, paddingVertical: 8, borderRadius: 32 },
        tabBarBackground: () => (
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              marginHorizontal: 12,
              borderRadius: 40,
              overflow: "hidden",
            }}
          >
            <BlurView
              intensity={65}
              tint="dark"
              style={{ flex: 1, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)" }}
            />
          </View>
        ),
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 8,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: "transparent",
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          shadowColor: "transparent",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discussions",
          tabBarIcon: ({ focused }) => <TabIcon Icon={MessageCircle} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Amis",
          tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Réglages",
          tabBarIcon: ({ focused }) => <TabIcon Icon={Settings} focused={focused} />,
        }}
      />
    </Tabs>
  );
}
