import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lineTotal } from "@/lib/format";
import { uuidv4 } from "@/lib/id";
import type { CartLine } from "@/types/models";

interface CartState {
  lines: CartLine[];
  /** Branch the cart belongs to. */
  branchId: string | null;
  /** Idempotency token for the current cart; survives checkout retries. */
  checkoutId: string | null;
  addLine: (line: CartLine, branchId: string) => void;
  /** Replace a configured line in place (used by edit-from-checkout). */
  replaceLine: (lineId: string, line: CartLine) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  /** Duplicate a line in place (inserted right after the original). */
  duplicateLine: (lineId: string) => void;
  /** Re-insert a line at a position (used to undo a removal). */
  insertLineAt: (line: CartLine, index: number) => void;
  clear: () => void;
  /** Lazily create (and persist) the checkout token for this cart. */
  ensureCheckoutId: () => string;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      branchId: null,
      checkoutId: null,

      addLine: (line, branchId) => {
        const sameBranch = get().branchId === branchId || get().branchId === null;
        if (sameBranch) {
          set({ lines: [...get().lines, line], branchId });
        } else {
          // Different branch -> a fresh cart with a fresh checkout token.
          set({ lines: [line], branchId, checkoutId: null });
        }
      },

      replaceLine: (lineId, line) =>
        set({
          lines: get().lines.map((l) => (l.lineId === lineId ? line : l)),
        }),

      updateQuantity: (lineId, quantity) =>
        set({
          lines: get().lines.map((l) =>
            l.lineId === lineId ? { ...l, quantity: Math.max(1, quantity) } : l,
          ),
        }),

      removeLine: (lineId) =>
        set({ lines: get().lines.filter((l) => l.lineId !== lineId) }),

      duplicateLine: (lineId) => {
        const lines = get().lines;
        const idx = lines.findIndex((l) => l.lineId === lineId);
        if (idx < 0) return;
        const copy: CartLine = {
          ...lines[idx],
          lineId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        };
        set({ lines: [...lines.slice(0, idx + 1), copy, ...lines.slice(idx + 1)] });
      },

      insertLineAt: (line, index) => {
        const lines = get().lines;
        const at = Math.max(0, Math.min(index, lines.length));
        set({ lines: [...lines.slice(0, at), line, ...lines.slice(at)] });
      },

      clear: () => set({ lines: [], branchId: null, checkoutId: null }),

      ensureCheckoutId: () => {
        let id = get().checkoutId;
        if (!id) {
          id = uuidv4();
          set({ checkoutId: id });
        }
        return id;
      },
    }),
    {
      name: "cafinity-cart",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Total number of drinks in the cart. */
export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

/** Sum of all line totals (before promo). */
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}
