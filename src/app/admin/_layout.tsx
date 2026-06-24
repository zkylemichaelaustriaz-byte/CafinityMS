import { Stack } from "expo-router";
import { RoleGate } from "@/components/RoleGate";

export default function AdminLayout() {
  return (
    <RoleGate allow={["admin"]}>
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGate>
  );
}
