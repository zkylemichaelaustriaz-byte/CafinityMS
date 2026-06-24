import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Branch } from "@/types/models";

interface BranchState {
  branch: Branch | null;
  setBranch: (branch: Branch) => void;
  clearBranch: () => void;
}

export const useBranch = create<BranchState>()(
  persist(
    (set) => ({
      branch: null,
      setBranch: (branch) => set({ branch }),
      clearBranch: () => set({ branch: null }),
    }),
    {
      name: "cafinity-branch",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
