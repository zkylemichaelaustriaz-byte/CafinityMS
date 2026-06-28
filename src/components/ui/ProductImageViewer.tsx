import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Full-screen product image viewer over a dark backdrop. Closes via the Close
 * button, Android hardware Back (Modal onRequestClose), or tapping the backdrop
 * outside the image. The image uses contentFit="contain" so its real aspect
 * ratio is preserved (never stretched). No hidden gesture is required to close.
 */
export function ProductImageViewer({
  visible,
  source,
  uri,
  name,
  onClose,
}: {
  visible: boolean;
  /** Local image module (require) — takes priority over uri. */
  source?: number;
  uri?: string | null;
  name: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const closeRef = useRef<View>(null);

  const hasImage = !!source || !!uri;

  // Reset load state each time the viewer opens; move screen-reader focus to the
  // Close control so the user lands somewhere actionable.
  useEffect(() => {
    if (!visible) return;
    setLoaded(false);
    setFailed(false);
    const t = setTimeout(() => {
      const node = findNodeHandle(closeRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 250);
    return () => clearTimeout(t);
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* Backdrop — tapping anywhere outside the image closes the viewer */}
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close image viewer"
        className="flex-1 items-center justify-center bg-black/95"
      >
        {/* Image — stop propagation so a tap on the image itself doesn't close */}
        <Pressable
          onPress={() => {}}
          className="w-full flex-1 items-center justify-center px-4"
          accessibilityLabel={`${name} image`}
        >
          {hasImage && !failed ? (
            <>
              {!loaded ? (
                <View className="absolute inset-0 items-center justify-center">
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
              <Image
                source={source ?? { uri: uri ?? undefined }}
                contentFit="contain"
                transition={reducedMotion ? 0 : 200}
                cachePolicy="memory-disk"
                onLoadEnd={() => setLoaded(true)}
                onError={() => setFailed(true)}
                accessible
                accessibilityLabel={name}
                style={{ width: "100%", height: "100%" }}
              />
            </>
          ) : (
            <View className="items-center">
              <Ionicons name="image-outline" size={48} color="#9b8f86" />
              <Text className="mt-2 text-sm text-white/70">Image unavailable</Text>
            </View>
          )}
        </Pressable>
      </Pressable>

      {/* Product name — top-left, high contrast over any image */}
      <View
        pointerEvents="none"
        style={{ top: insets.top + 8 }}
        className="absolute left-5 right-20"
      >
        <Text className="font-heading text-base text-white" numberOfLines={2}>
          {name}
        </Text>
      </View>

      {/* Close — top-right, readable over light or dark images */}
      <View ref={closeRef} style={{ top: insets.top + 4 }} className="absolute right-4">
        <Pressable
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
        >
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}
