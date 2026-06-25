import "@/global.css";

import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Fraunces_400Regular,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_900Black,
} from "@expo-google-fonts/fraunces";
import { AppLoading } from "@/components/ui/AppLoading";
import { AppThemeProvider, useResolvedTheme } from "@/theme/AppThemeProvider";
import { useAppearance } from "@/store/appearance";
import { useAuth } from "@/store/auth";
import { useSeasonalTheme } from "@/store/seasonalTheme";

void SplashScreen.preventAutoHideAsync();

/** Navigator rendered inside the theme provider so its content bg stays reactive. */
function RootNavigator() {
  const { colors } = useResolvedTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
      }}
    />
  );
}

export default function RootLayout() {
  const init = useAuth((s) => s.init);
  const initialized = useAuth((s) => s.initialized);
  const appearanceHydrated = useAppearance((s) => s.hasHydrated);
  const hydrateSeasonal = useSeasonalTheme((s) => s.hydrate);

  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_900Black,
  });

  // Hold the (already-themed) loader until the saved appearance is known, so the
  // app never flashes the default light theme before a saved Dark loads.
  const ready = initialized && appearanceHydrated && (fontsLoaded || !!fontError);

  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const showApp = ready && minElapsed;

  useEffect(() => {
    init();
  }, [init]);

  // Adopt the server's active campaign palette once the app is ready.
  useEffect(() => {
    if (initialized) void hydrateSeasonal();
  }, [initialized, hydrateSeasonal]);

  // Re-check the active campaign when the app returns to the foreground so a
  // campaign an admin activates/ends propagates without a cold start.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void hydrateSeasonal();
    });
    return () => sub.remove();
  }, [hydrateSeasonal]);

  // Branded cold-start: keep the loader visible ~2.5s minimum (cold start only).
  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setTimedOut(true), 12000);
    return () => clearTimeout(t);
  }, [ready]);

  useEffect(() => {
    if (showApp) void SplashScreen.hideAsync();
  }, [showApp]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          {!showApp ? (
            <AppLoading
              timedOut={timedOut}
              onRetry={() => {
                setTimedOut(false);
                init();
              }}
            />
          ) : (
            <RootNavigator />
          )}
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
