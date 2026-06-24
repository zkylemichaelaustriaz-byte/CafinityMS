import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";

/**
 * True while the soft keyboard is shown. Uses the `will*` events on iOS (so the
 * UI reacts in step with the keyboard animation) and `did*` on Android.
 * Screens use this to drop sticky footers that would otherwise cover the field.
 */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvt, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}
