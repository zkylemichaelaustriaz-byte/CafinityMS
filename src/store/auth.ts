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
  signOut: () => Promise<{ networkFailed: boolean }>;
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
    // 1) Tear down user-specific realtime + cached state FIRST so no listener
    //    races the session clear (NotificationProvider unmounts on redirect).
    useNotifications.getState().reset();
    useFavorites.getState().reset();

    // 2) Attempt the remote (global) sign-out, but NEVER let a network failure
    //    leave the user half-authenticated.
    let networkFailed = false;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      networkFailed = true;
      // Guarantee the session is cleared locally even if the server was
      // unreachable (local scope does not hit the network).
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignore — we clear our own state below regardless.
      }
    }

    // 3) Clear our own state. The onAuthStateChange listener also fires, but we
    //    set here too so logout completes deterministically.
    set({ session: null, profile: null, profileLoaded: true });
    return { networkFailed };
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
