import { Text, View } from "react-native";
import { Button } from "@/components/ui/Button";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

/** Shown when a data request fails — distinct from a genuine empty result. */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8 py-16">
      <Text style={{ fontSize: 48 }}>⚠️</Text>
      <Text className="mt-4 text-center font-heading text-lg text-textPrimary">
        Something went wrong
      </Text>
      <Text className="mt-1.5 text-center text-sm text-textSecondary">
        {message ?? "Please check your connection and try again."}
      </Text>
      {onRetry ? (
        <View className="mt-6 w-44">
          <Button label="Retry" variant="outline" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}
