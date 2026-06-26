import { create } from "zustand";

interface NetworkState {
  /** True when the device has a usable internet connection. */
  online: boolean;
  /** Timestamp of the most recent offline→online transition (drives the toast). */
  reconnectedAt: number | null;
  setOnline: (online: boolean) => void;
}

export const useNetwork = create<NetworkState>((set, get) => ({
  online: true, // optimistic until the first NetInfo event arrives
  reconnectedAt: null,
  setOnline: (online) => {
    const prev = get().online;
    if (prev === online) return;
    set({ online, reconnectedAt: online && prev === false ? Date.now() : get().reconnectedAt });
  },
}));

/** Imperative check for use inside async actions (e.g. block checkout). */
export function isOnline(): boolean {
  return useNetwork.getState().online;
}
