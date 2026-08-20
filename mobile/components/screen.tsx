import type { PropsWithChildren } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

/** Full-screen container: brand background, safe-area aware, keyboard-avoiding, scrollable. */
export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <Svg pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }} viewBox="0 0 402 340">
        <Defs>
          <RadialGradient id="screenHaloLeft" cx="48" cy="-34" r="360" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#337bff" stopOpacity={0.26} />
            <Stop offset="0.35" stopColor="#337bff" stopOpacity={0.08} />
            <Stop offset="0.58" stopColor="#337bff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="screenHaloRight" cx="382" cy="27" r="340" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#aa6ef3" stopOpacity={0.22} />
            <Stop offset="0.35" stopColor="#aa6ef3" stopOpacity={0.07} />
            <Stop offset="0.6" stopColor="#aa6ef3" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="402" height="340" fill="url(#screenHaloLeft)" />
        <Rect x="0" y="0" width="402" height="340" fill="url(#screenHaloRight)" />
      </Svg>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow px-6 py-8"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
