import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/store/auth";

export default function AuthLayout() {
  const session = useAuth((s) => s.session);
  // Already signed in -> hand off to the role-aware gate (index.tsx).
  if (session) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
