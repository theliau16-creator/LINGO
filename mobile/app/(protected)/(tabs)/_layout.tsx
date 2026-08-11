import { Tabs } from "expo-router";
import { Text } from "react-native";

/**
 * Bottom-tab shell equivalent to the web's app-shell.tsx. Chats and Friends
 * are placeholders until Phase 2 / Phase 5 — the navigation structure is
 * built now so later phases only fill content in, not restructure nav.
 * Emoji tab icons for Phase 1 (no icon library installed yet); swap for
 * @expo/vector-icons once real screens need a proper icon set (Phase 2+).
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#337bff",
        tabBarInactiveTintColor: "#9598a4",
        tabBarStyle: { backgroundColor: "#0e0f16", borderTopColor: "rgba(255,255,255,0.10)" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Discussions",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Amis",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
        }}
      />
    </Tabs>
  );
}
