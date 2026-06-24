import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getActiveCampaign } from "@/lib/api";

interface SeasonalThemeState {
  /** Preset key of the server's active campaign — shared by everyone. */
  activeKey: string | null;
  /** Device-local preview (admin only), overrides activeKey when set. */
  previewKey: string | null;
  /** Fetch the active campaign and adopt its palette (or default if none). */
  hydrate: () => Promise<void>;
  setPreview: (key: string | null) => void;
  clearPreview: () => void;
}

/**
 * The active seasonal palette comes from the admin-selected campaign on the
 * server, NOT each customer's device — so all customers see the same season.
 * `activeKey` is persisted only to avoid a flash of the default palette on the
 * next cold start; it is always re-confirmed by hydrate(). `previewKey` is never
 * persisted: it's a transient, on-device admin preview.
 */
export const useSeasonalTheme = create<SeasonalThemeState>()(
  persist(
    (set) => ({
      activeKey: null,
      previewKey: null,
      hydrate: async () => {
        try {
          const c = await getActiveCampaign();
          set({ activeKey: c?.is_active ? (c.preset_key ?? null) : null });
        } catch {
          // Keep the last known palette on transient failures.
        }
      },
      setPreview: (key) => set({ previewKey: key }),
      clearPreview: () => set({ previewKey: null }),
    }),
    {
      name: "cafinity-seasonal-theme",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ activeKey: s.activeKey }),
    },
  ),
);

/** Effective palette key: a live preview wins over the server's active key. */
export function effectiveSeasonalKey(s: SeasonalThemeState): string | null {
  return s.previewKey ?? s.activeKey;
}
