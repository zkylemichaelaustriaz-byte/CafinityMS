import { humanizeError } from "@/lib/errors";

/** Maps server-enforced order business rules to clear, actionable messages. */
export function mapOrderError(e: unknown): { title: string; message: string } {
  const msg = (e as { message?: string })?.message ?? "";
  if (/confirm cash payment before preparing/i.test(msg)) {
    return {
      title: "Payment must be confirmed first",
      message: "Confirm the customer's cash payment before starting preparation.",
    };
  }
  if (/confirm cash payment before completing/i.test(msg)) {
    return {
      title: "Payment must be confirmed first",
      message: "Confirm cash payment before completing this order.",
    };
  }
  if (/verify the pwd\/senior id/i.test(msg)) {
    return {
      title: "Verify ID first",
      message: "Verify the PWD/Senior ID before confirming payment.",
    };
  }
  if (/cannot be advanced from/i.test(msg)) {
    return {
      title: "Order was already updated",
      message: "Someone else updated this order. Refreshing to the latest state.",
    };
  }
  return { title: "Could not update order", message: humanizeError(e) };
}
