import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppearancePref = "system" | "light" | "dark";

interface AppearanceState {
  preference: AppearancePref;
  /** True once the persisted preference has loaded (prevents a theme flash). */
  hasHydrated: boolean;
  setPreference: (p: AppearancePref) => void;
}

/** User's appearance choice: follow the device, or force light/dark. Persisted. */
export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      preference: "system",
      hasHydrated: false,
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "cafinity-appearance",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ preference: s.preference }),
      onRehydrateStorage: () => (state) => {
        // Marks hydration complete even if there was no saved value yet.
        useAppearance.setState({ hasHydrated: true });
        void state;
      },
    },
  ),
);
