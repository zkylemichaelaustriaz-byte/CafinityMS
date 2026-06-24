import { forwardRef, useCallback, useRef } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

/**
 * ScrollView preconfigured for keyboard-safe forms:
 * - iOS insets the content above the keyboard (automaticallyAdjustKeyboardInsets)
 * - Android relies on softwareKeyboardLayoutMode="resize" (app.json)
 * - taps pass through to controls; drag dismisses the keyboard
 * Pair with useKeyboardAwareScroll() to scroll the focused bottom field into view.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardAwareScrollView(props, ref) {
    return (
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        {...props}
      />
    );
  },
);

/**
 * Returns a ScrollView ref + an onFocus handler that scrolls the focused
 * bottom-of-screen input clear of the keyboard (deferred so the keyboard frame
 * is settled first). Not a hardcoded offset — it scrolls to the live end.
 */
export function useKeyboardAwareScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const handleFocus = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);
  return { scrollRef, handleFocus };
}
