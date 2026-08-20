import { ActivityIndicator, Text, TouchableOpacity, type TouchableOpacityProps } from "react-native";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = TouchableOpacityProps & {
  label: string;
  loading?: boolean;
  variant?: ButtonVariant;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-primary",
  secondary: "bg-secondary border border-border",
  ghost: "bg-transparent",
};

const VARIANT_TEXT_CLASSES: Record<ButtonVariant, string> = {
  primary: "text-primary-foreground",
  secondary: "text-secondary-foreground",
  ghost: "text-primary",
};

export function Button({ label, loading, variant = "primary", disabled, className, ...props }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-3xl px-5 py-4 ${VARIANT_CLASSES[variant]} ${isDisabled ? "opacity-50" : ""} ${className ?? ""}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fbfcfe" : "#f7f8fb"} />
      ) : (
        <Text className={`text-[15px] font-semibold ${VARIANT_TEXT_CLASSES[variant]}`}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}
