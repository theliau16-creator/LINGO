import { useRef } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";

/**
 * QR-only camera scanner — expo-camera's CameraView (SDK 57), not a port of
 * the web's html5-qrcode (browser-only dependency, no native equivalent
 * needed). `handledRef` mirrors the web QrScanner's own guard: onBarcodeScanned
 * keeps firing for every frame while the code is in view, so only the first
 * result is forwarded — the caller decides what happens next (including
 * whether to remount this component to scan again).
 */
export function QrScanner({ onResult }: { onResult: (value: string) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const handledRef = useRef(false);

  if (!permission) {
    return (
      <View className="h-72 items-center justify-center rounded-3xl bg-black/60">
        <Text className="text-[13px] text-muted-foreground">Vérification de la permission caméra…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="h-72 items-center justify-center gap-3 rounded-3xl bg-black/60 px-6">
        <Text className="text-center text-[13px] text-muted-foreground">
          {permission.canAskAgain
            ? "Lingo a besoin de la caméra pour scanner un QR code."
            : "Accès caméra refusé. Autorisez-le dans les réglages iOS pour scanner un QR code."}
        </Text>
        <Pressable
          onPress={() => (permission.canAskAgain ? void requestPermission() : void Linking.openSettings())}
          className="rounded-2xl bg-primary px-4 py-2.5"
        >
          <Text className="text-[13px] font-semibold text-primary-foreground">
            {permission.canAskAgain ? "Autoriser la caméra" : "Ouvrir les réglages"}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="h-72 overflow-hidden rounded-3xl bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={({ data }) => {
          if (handledRef.current) return;
          handledRef.current = true;
          onResult(data);
        }}
      />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-48 w-48 rounded-3xl border-2 border-primary/70" />
      </View>
    </View>
  );
}
