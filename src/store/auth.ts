import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getProfile } from "@/lib/api";
import { useFavorites } from "@/store/favorites";
import { useNotifications } from "@/store/notifications";
import type { Profile } from "@/types/models";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  /** Initial session check has completed. */
  initialized: boolean;
  /** First profile fetch has resolved (or there is no session). */
  profileLoaded: boolean;
  init: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    firstName: string,
    lastName: string,
    email: string,
    password: string,
  ) => Promise<{ needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

let started = false;

export const useAuth = create<AuthState>((set, get) => ({
  session: null,
  profile: null,
  initialized: false,
  profileLoaded: false,

  init: () => {
    if (started) return;
    started = true;

    supabase.auth.getSession().then(({ data }) => {
      const session = data.session;
      set({ session, initialized: true });
      if (session) void loadProfile(session.user.id, set);
      else set({ profileLoaded: true });
    });

    // NOTE: never await other supabase calls *inside* this callback (it can
    // deadlock the auth client) — defer the profile fetch instead.
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, initialized: true });
      if (session) {
        set({ profileLoaded: false });
        setTimeout(() => void loadProfile(session.user.id, set), 0);
      } else {
        set({ profile: null, profileLoaded: true });
      }
    });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  },

  signUp: async (firstName, lastName, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { first_name: firstName.trim(), last_name: lastName.trim() } },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    useFavorites.getState().reset();
    useNotifications.getState().reset();
    set({ session: null, profile: null, profileLoaded: true });
  },

  refreshProfile: async () => {
    const session = get().session;
    if (!session) return;
    await loadProfile(session.user.id, set);
  },
}));

async function loadProfile(
  userId: string,
  set: (partial: Partial<AuthState>) => void,
) {
  try {
    const profile = await getProfile(userId);
    set({ profile, profileLoaded: true });
  } catch {
    set({ profileLoaded: true });
  }
}
