import { Redirect } from "expo-router";
import { FullScreenLoader } from "@/components/RoleGate";
import { useAuth } from "@/store/auth";

/** Entry gate: route the user by auth state and role. */
export default function Index() {
  const session = useAuth((s) => s.session);
  const profile = useAuth((s) => s.profile);
  const profileLoaded = useAuth((s) => s.profileLoaded);

  if (!session) return <Redirect href="/login" />;
  if (!profileLoaded) return <FullScreenLoader />;

  const role = profile?.role ?? "customer";
  if (role === "admin") return <Redirect href="/admin" />;
  if (role === "staff") return <Redirect href="/staff" />;
  return <Redirect href="/home" />;
}
