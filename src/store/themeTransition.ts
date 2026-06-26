import { create } from "zustand";
import { THEME_TRANSITION_MINIMUM_DURATION_MS } from "@/config/launch";

let timer: ReturnType<typeof setTimeout> | null = null;

interface ThemeTransitionState {
  active: boolean;
  targetMode: "light" | "dark";
  /** Raise the branded overlay in the TARGET palette; auto-hides after the
   *  configured minimum. Ignores re-entry while already active (no stacking). */
  show: (target: "light" | "dark") => void;
}

export const useThemeTransition = create<ThemeTransitionState>((set, get) => ({
  active: false,
  targetMode: "light",
  show: (target) => {
    if (get().active) return;
    set({ active: true, targetMode: target });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => set({ active: false }), THEME_TRANSITION_MINIMUM_DURATION_MS);
  },
}));
