import { View } from "react-native";
import QRCodeSvg from "react-native-qrcode-svg";

/** Renders a QR code — react-native-qrcode-svg (pure SVG, no native module), matching src/components/qr-code.tsx's dark-on-white look. */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  return (
    <View className="rounded-3xl bg-white p-4">
      <QRCodeSvg value={value} size={size} backgroundColor="white" color="#0b1020" />
    </View>
  );
}
