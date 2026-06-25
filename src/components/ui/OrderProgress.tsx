import { Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Order } from "@/types/models";

interface Step {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  done: boolean;
}

/**
 * Live 5-step order progress: Order placed → Payment confirmed → Preparing →
 * Ready for pickup → Completed. Completed steps are checked, the current step is
 * accented + labelled "In progress", future steps are muted. Cancellation is
 * handled separately by the caller.
 *
 * `variant="horizontal"` renders a compact row of nodes with a single caption —
 * used for the order-card preview and the collapsed order tracker.
 */
export function OrderProgress({
  order,
  variant = "vertical",
}: {
  order: Order;
  variant?: "vertical" | "horizontal";
}) {
  const paid = order.payment_status === "paid";
  const s = order.status;

  const steps: Step[] = [
    { key: "placed", label: "Order placed", icon: "receipt-outline", done: true },
    {
      key: "paid",
      label: paid
        ? "Payment confirmed"
        : order.payment_method === "Cash"
          ? "Pay at the counter"
          : "Payment confirmed",
      icon: "card-outline",
      done: paid,
    },
    {
      key: "preparing",
      label: "Preparing",
      icon: "cafe-outline",
      done: s === "preparing" || s === "ready" || s === "completed",
    },
    {
      key: "ready",
      label: "Ready for pickup",
      icon: "checkmark-circle-outline",
      done: s === "ready" || s === "completed",
    },
    { key: "completed", label: "Completed", icon: "bag-check-outline", done: s === "completed" },
  ];

  let current = steps.findIndex((st) => !st.done);
  if (current === -1) current = steps.length - 1;

  if (variant === "horizontal") {
    return (
      <View accessible accessibilityLabel={`Order progress: ${steps[current].label}`}>
        <View className="flex-row items-center">
          {steps.map((st, i) => {
            const isDone = i < current;
            const isCurrent = i === current;
            const last = i === steps.length - 1;
            const circle = isDone
              ? "bg-brandPrimary"
              : isCurrent
                ? "bg-accent"
                : "bg-surfaceMuted";
            return (
              <View key={st.key} className={`flex-row items-center ${last ? "" : "flex-1"}`}>
                <View className={`h-8 w-8 items-center justify-center rounded-full ${circle}`}>
                  <Ionicons
                    name={isDone ? "checkmark" : st.icon}
                    size={isDone ? 16 : 14}
                    color={isDone ? "#fff" : isCurrent ? "#3A2410" : "#C9A47C"}
                  />
                </View>
                {!last ? (
                  <View
                    className={`mx-1 h-0.5 flex-1 ${i < current ? "bg-brandPrimary" : "bg-line"}`}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        <Text className="mt-2 text-sm font-semibold text-textPrimary">
          {steps[current].label}
          {current === steps.length - 1 && s === "completed" ? "" : " · In progress"}
        </Text>
      </View>
    );
  }

  return (
    <View
      className="mt-1"
      accessible
      accessibilityLabel={`Order progress: ${steps[current].label}`}
    >
      {steps.map((st, i) => {
        const isDone = i < current;
        const isCurrent = i === current;
        const last = i === steps.length - 1;
        const circle = isDone ? "bg-brandPrimary" : isCurrent ? "bg-accent" : "bg-surfaceMuted";
        return (
          <View key={st.key} className="flex-row">
            <View className="items-center">
              <View className={`h-9 w-9 items-center justify-center rounded-full ${circle}`}>
                <Ionicons
                  name={isDone ? "checkmark" : st.icon}
                  size={isDone ? 18 : 16}
                  color={isDone ? "#fff" : isCurrent ? "#3A2410" : "#C9A47C"}
                />
              </View>
              {!last ? (
                <View
                  style={{ minHeight: 18 }}
                  className={`w-0.5 flex-1 ${i < current ? "bg-brandPrimary" : "bg-line"}`}
                />
              ) : null}
            </View>
            <View className={`ml-3 flex-1 ${last ? "" : "pb-4"}`}>
              <Text
                className={`text-sm ${
                  isCurrent
                    ? "font-bold text-textPrimary"
                    : isDone
                      ? "font-semibold text-textPrimary"
                      : "font-medium text-textMuted"
                }`}
              >
                {st.label}
              </Text>
              {isCurrent && s !== "completed" ? (
                <Text className="text-xs text-textMuted">In progress</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
