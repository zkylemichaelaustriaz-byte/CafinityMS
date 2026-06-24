import "@/global.css";

import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
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
import { ThemeProvider } from "@/theme/ThemeProvider";
import { applyScheme, applySeasonal, theme } from "@/constants/theme";
import { useAppearance } from "@/store/appearance";
import { useAuth } from "@/store/auth";
import { effectiveSeasonalKey, useSeasonalTheme } from "@/store/seasonalTheme";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const init = useAuth((s) => s.init);
  const initialized = useAuth((s) => s.initialized);
  const preference = useAppearance((s) => s.preference);
  const systemScheme = useColorScheme();
  const seasonalKey = useSeasonalTheme(effectiveSeasonalKey);
  const hydrateSeasonal = useSeasonalTheme((s) => s.hydrate);

  const [fontsLoaded, fontError] = useFonts({
    Fraunces_400Regular,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_900Black,
  });

  const ready = initialized && (fontsLoaded || !!fontError);

  // Minimum display time avoids a loading flash; timeout offers a retry.
  const [minElapsed, setMinElapsed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const showApp = ready && minElapsed;

  // Resolve the effective scheme (preference, with "system" following the OS).
  const effective: "light" | "dark" =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;
  applyScheme(effective);
  applySeasonal(seasonalKey);

  useEffect(() => {
    init();
  }, [init]);

  // Adopt the server's active campaign palette once the app is ready.
  useEffect(() => {
    if (initialized) void hydrateSeasonal();
  }, [initialized, hydrateSeasonal]);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 450);
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
        <StatusBar style={effective === "dark" ? "light" : "dark"} />
        <ThemeProvider scheme={effective} seasonalKey={seasonalKey}>
          {!showApp ? (
            <AppLoading
              timedOut={timedOut}
              onRetry={() => {
                setTimedOut(false);
                init();
              }}
            />
          ) : (
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: theme.background },
              }}
            />
          )}
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
