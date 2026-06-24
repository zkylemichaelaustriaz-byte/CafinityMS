import { Pressable, type PressableProps } from "react-native";
import { haptics, type HapticKind } from "@/lib/haptics";

interface AnimatedPressableProps extends PressableProps {
  className?: string;
  /** Optional haptic fired on press. */
  haptic?: HapticKind;
}

/**
 * Pressable with NativeWind-native className (reliable backgrounds), a press
 * feedback via the `active:` variant, and optional haptics.
 *
 * NOTE: this intentionally uses a plain `Pressable` rather than a
 * `createAnimatedComponent(Pressable)` + cssInterop wrapper — the latter failed
 * to apply `className` backgrounds, which made buttons/cards render transparent.
 */
export function AnimatedPressable({
  className,
  haptic,
  onPress,
  ...rest
}: AnimatedPressableProps) {
  return (
    <Pressable
      onPress={(e) => {
        if (haptic) haptics[haptic]();
        onPress?.(e);
      }}
      className={`active:opacity-90 ${className ?? ""}`}
      {...rest}
    />
  );
}
