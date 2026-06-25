import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface StaffPrefsState {
  /** Vibrate when a new order arrives in the live queue. */
  hapticOnNewOrder: boolean;
  setHapticOnNewOrder: (v: boolean) => void;
}

export const useStaffPrefs = create<StaffPrefsState>()(
  persist(
    (set) => ({
      hapticOnNewOrder: true,
      setHapticOnNewOrder: (v) => set({ hapticOnNewOrder: v }),
    }),
    {
      name: "cafinity-staff-prefs",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
