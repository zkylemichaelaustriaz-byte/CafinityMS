import { Stack } from "expo-router";
import { RoleGate } from "@/components/RoleGate";

export default function StaffLayout() {
  return (
    <RoleGate allow={["staff", "admin"]}>
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGate>
  );
}
