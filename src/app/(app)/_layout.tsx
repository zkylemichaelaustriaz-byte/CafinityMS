import { Redirect, Stack } from "expo-router";
import { NotificationProvider } from "@/components/NotificationProvider";
import { useAuth } from "@/store/auth";

export default function AppLayout() {
  const session = useAuth((s) => s.session);
  // Protect the whole app area.
  if (!session) return <Redirect href="/login" />;

  return (
    <>
      <NotificationProvider />
      <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="branches" options={{ presentation: "modal" }} />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="cart" />
      <Stack.Screen name="checkout" />
      <Stack.Screen name="order/[id]" />
        <Stack.Screen name="receipt/[id]" />
        <Stack.Screen name="reorder/[id]" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="edit-profile" />
      </Stack>
    </>
  );
}
