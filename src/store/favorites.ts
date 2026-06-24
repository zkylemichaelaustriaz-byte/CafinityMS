import { create } from "zustand";
import { addFavorite, getFavoriteIds, removeFavorite } from "@/lib/api";

interface FavoritesState {
  /** Product ids the user has favorited. */
  ids: string[];
  loaded: boolean;
  /** Pull the current user's favorites from the server. */
  load: () => Promise<void>;
  /** Optimistically toggle a product, reverting if the server rejects it. */
  toggle: (productId: string) => Promise<void>;
  /** Clear in-memory favorites (e.g. on sign-out / account switch). */
  reset: () => void;
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  ids: [],
  loaded: false,

  load: async () => {
    try {
      set({ ids: await getFavoriteIds(), loaded: true });
    } catch {
      // Leave whatever we had; screens still render without favorites.
      set({ loaded: true });
    }
  },

  toggle: async (productId) => {
    const has = get().ids.includes(productId);
    // Optimistic update.
    set({
      ids: has ? get().ids.filter((id) => id !== productId) : [...get().ids, productId],
    });
    try {
      if (has) await removeFavorite(productId);
      else await addFavorite(productId);
    } catch {
      // Revert on failure.
      set({
        ids: has ? [...get().ids, productId] : get().ids.filter((id) => id !== productId),
      });
    }
  },

  reset: () => set({ ids: [], loaded: false }),
}));
