import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MAX = 6;

interface RecentSearchesState {
  terms: string[];
  /** Add a term to the front (deduped, case-insensitive), trimming to MAX. */
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
}

export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      terms: [],
      add: (raw) => {
        const term = raw.trim();
        if (term.length < 2) return;
        const rest = get().terms.filter((t) => t.toLowerCase() !== term.toLowerCase());
        set({ terms: [term, ...rest].slice(0, MAX) });
      },
      remove: (term) =>
        set({ terms: get().terms.filter((t) => t.toLowerCase() !== term.toLowerCase()) }),
      clear: () => set({ terms: [] }),
    }),
    {
      name: "cafinity-recent-searches",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
