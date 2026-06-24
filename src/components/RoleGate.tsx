import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/store/auth";
import type { UserRole } from "@/types/models";

export function FullScreenLoader() {
  return (
    <View className="flex-1 items-center justify-center bg-cream">
      <ActivityIndicator color={Colors.brand} />
    </View>
  );
}

function homeFor(role: UserRole): string {
  if (role === "admin") return "/admin";
  if (role === "staff") return "/staff";
  return "/home";
}

/** Wraps an area so only the allowed roles can enter; others are redirected
 *  to the home that matches their own role. */
export function RoleGate({
  allow,
  children,
}: {
  allow: UserRole[];
  children: ReactNode;
}) {
  const session = useAuth((s) => s.session);
  const profile = useAuth((s) => s.profile);
  const profileLoaded = useAuth((s) => s.profileLoaded);

  if (!session) return <Redirect href="/login" />;
  if (!profileLoaded) return <FullScreenLoader />;

  const role = profile?.role ?? "customer";
  if (!allow.includes(role)) return <Redirect href={homeFor(role)} />;

  return <>{children}</>;
}
