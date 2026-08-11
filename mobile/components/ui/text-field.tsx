import { Text, TextInput, View, type TextInputProps } from "react-native";

type TextFieldProps = TextInputProps & {
  label?: string;
  error?: string | null;
};

export function TextField({ label, error, className, ...props }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      {label ? (
        <Text className="px-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </Text>
      ) : null}
      <TextInput
        placeholderTextColor="#9598a4"
        className={`rounded-2xl border border-border bg-secondary px-4 py-3.5 text-[15px] text-foreground ${className ?? ""}`}
        {...props}
      />
      {error ? <Text className="px-1 text-[13px] text-destructive">{error}</Text> : null}
    </View>
  );
}
