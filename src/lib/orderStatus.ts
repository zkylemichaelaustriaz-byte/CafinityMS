import type { OrderStatus } from "@/types/models";

// Single source of truth for how an order status is presented. Replaces the
// per-screen statusLabel switch + ad-hoc Badge tone ternaries. DB values are
// unchanged — this only maps them to user-facing wording, an icon, and a tone.

export type StatusTone = "gray" | "amber" | "blue" | "green" | "red";

export interface StatusPresentation {
  /** Customer-facing label. */
  customerLabel: string;
  /** Operational (barista/admin) label. */
  staffLabel: string;
  /** Short customer-facing description. */
  description: string;
  /** Ionicons name (cast to the glyph map at the call site). */
  icon: string;
  /** Badge tone + semantic color family. */
  tone: StatusTone;
}

export const ORDER_STATUS: Record<OrderStatus, StatusPresentation> = {
  pending: {
    customerLabel: "Order received",
    staffLabel: "New order",
    description: "Waiting for the barista to start.",
    icon: "receipt-outline",
    tone: "gray",
  },
  preparing: {
    customerLabel: "Preparing",
    staffLabel: "Preparing",
    description: "Your order is being prepared.",
    icon: "cafe-outline",
    tone: "amber",
  },
  ready: {
    customerLabel: "Ready for pickup",
    staffLabel: "Ready",
    description: "Ready for pickup at the counter.",
    icon: "bag-check-outline",
    tone: "blue",
  },
  completed: {
    customerLabel: "Completed",
    staffLabel: "Completed",
    description: "Order completed. Enjoy your coffee!",
    icon: "checkmark-done-circle-outline",
    tone: "green",
  },
  cancelled: {
    customerLabel: "Cancelled",
    staffLabel: "Cancelled",
    description: "This order was cancelled.",
    icon: "close-circle-outline",
    tone: "red",
  },
};

export function statusPresentation(status: OrderStatus | string): StatusPresentation {
  return (
    ORDER_STATUS[status as OrderStatus] ?? {
      customerLabel: String(status),
      staffLabel: String(status),
      description: "",
      icon: "ellipse-outline",
      tone: "gray",
    }
  );
}

export function orderStatusLabel(
  status: OrderStatus | string,
  audience: "customer" | "staff" = "customer",
): string {
  const p = statusPresentation(status);
  return audience === "staff" ? p.staffLabel : p.customerLabel;
}

export function orderStatusTone(status: OrderStatus | string): StatusTone {
  return statusPresentation(status).tone;
}
