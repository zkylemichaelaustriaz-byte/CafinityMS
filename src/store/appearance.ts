import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type AppearancePref = "system" | "light" | "dark";

interface AppearanceState {
  preference: AppearancePref;
  setPreference: (p: AppearancePref) => void;
}

/** User's appearance choice: follow the device, or force light/dark. Persisted. */
export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      preference: "system",
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: "cafinity-appearance",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
