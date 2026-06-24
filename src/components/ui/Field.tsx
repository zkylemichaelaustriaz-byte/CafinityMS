import { forwardRef, useState } from "react";
import { Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface FieldProps extends TextInputProps {
  label?: string;
  error?: string;
  containerClassName?: string;
  /** Show a password visibility toggle. */
  toggleable?: boolean;
}

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  {
    label,
    error,
    className,
    containerClassName,
    toggleable,
    secureTextEntry,
    ...props
  },
  ref,
) {
  const [hidden, setHidden] = useState(true);
  const secure = toggleable ? hidden : secureTextEntry;

  return (
    <View className={containerClassName ?? "mb-4"}>
      {label ? (
        <Text className="mb-2 text-sm font-semibold text-textPrimary">{label}</Text>
      ) : null}
      <View className="justify-center">
        <TextInput
          ref={ref}
          placeholderTextColor="#B8A99C"
          secureTextEntry={secure}
          className={`rounded-2xl border bg-surface px-4 py-4 text-base text-textPrimary ${
            error ? "border-danger" : "border-line"
          } ${toggleable ? "pr-12" : ""} ${className ?? ""}`}
          {...props}
        />
        {toggleable ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            className="absolute right-3 p-1"
          >
            <Ionicons
              name={hidden ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#9A8A7B"
            />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text className="mt-1.5 text-xs text-danger">{error}</Text> : null}
    </View>
  );
});
