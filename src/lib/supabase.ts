import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True only when real credentials are present in the environment. */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("YOUR-PROJECT") &&
    !supabaseAnonKey.includes("YOUR-ANON"),
);

// Fall back to harmless placeholders so the app still boots and can render a
// friendly "configure Supabase" notice instead of crashing on startup.
const url = isSupabaseConfigured ? supabaseUrl : "https://placeholder.supabase.co";
const key = isSupabaseConfigured ? supabaseAnonKey : "placeholder-anon-key";

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the session fresh while the app is foregrounded (Supabase RN guidance).
if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
