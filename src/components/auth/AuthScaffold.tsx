import { useEffect, useRef, type ReactNode } from "react";
import { Animated, KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CoffeeCup } from "@/components/brand/CoffeeCup";
import { Wordmark } from "@/components/brand/Wordmark";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Shared two-part auth layout: an espresso brand hero on top and a rounded
 * "sheet" that holds the form. The sheet fades + lifts in on mount (skipped
 * when the OS reduce-motion setting is on). Keyboard-aware and scrollable so
 * no field is ever trapped under the keyboard on compact devices.
 */
export function AuthScaffold({
  tagline,
  markSize = 96,
  children,
}: {
  tagline: string;
  markSize?: number;
  children: ReactNode;
}) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? 1 : 0)).current;

  useEffect(() => {
    if (reduced) {
      anim.setValue(1);
      return;
    }
    Animated.timing(anim, {
      toValue: 1,
      duration: 380,
      useNativeDriver: true,
    }).start();
  }, [anim, reduced]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });

  return (
    <View className="flex-1 bg-brand-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand hero */}
          <SafeAreaView edges={["top"]}>
            <View className="items-center px-6 pb-9 pt-5">
              <CoffeeCup size={markSize} onDark />
              <View className="mt-1">
                <Wordmark size="lg" onDark />
              </View>
              <Text className="mt-2 text-center text-sm text-brand-200">{tagline}</Text>
            </View>
          </SafeAreaView>

          {/* Form sheet */}
          <Animated.View
            style={{ opacity: anim, transform: [{ translateY }] }}
            className="flex-1 rounded-t-[34px] bg-background px-6 pb-10 pt-7"
          >
            {children}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
