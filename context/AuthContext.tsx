import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/core/supabaseClient';
import { isGuestUser } from '@/core/auth/guestUtils';

export type UserProfile = {
  id: string;
  username: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isGuest: boolean;
  needsUsername: boolean;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ ok: true } | { ok: false; code: string }>;
  refreshProfile: () => Promise<void>;
  setUsernameViaEdge: (username: string) => Promise<
    | { ok: true }
    | { ok: false; code: string }
  >;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id, username: data.username };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setProfile(null);
      return;
    }
    const p = await fetchProfile(uid);
    setProfile(p);
  }, [session?.user?.id]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: existing, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!sessionError && existing.session) {
          setSession(existing.session);
          return;
        }
        if (sessionError) {
          await supabase.auth.signOut().catch(() => undefined);
        }
        const { data, error } = await supabase.auth.signInAnonymously();
        if (cancelled) return;
        if (error) {
          console.warn('[Auth] anonymous sign-in failed:', error.message);
          return;
        }
        setSession(data.session);
      } catch (e) {
        if (!cancelled) {
          console.warn('[Auth] initialization failed:', e);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const uid = session?.user?.id;
      if (!uid) {
        if (!ignore) setProfile(null);
        return;
      }
      const p = await fetchProfile(uid);
      if (!ignore) setProfile(p);
    })();
    return () => {
      ignore = true;
    };
  }, [session?.user?.id]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setProfile(null);
      return;
    }
    setProfile(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke('delete-account', {
      body: {},
    });
    if (error instanceof FunctionsHttpError) {
      try {
        const errBody = (await error.context.json()) as { error?: string };
        const code = errBody?.error;
        if (typeof code === 'string') return { ok: false as const, code };
      } catch {
        //
      }
      return { ok: false as const, code: 'network' };
    }
    if (error) {
      return { ok: false as const, code: 'network' };
    }
    const body = data as { error?: string; ok?: boolean } | null;
    if (body && typeof body === 'object' && body.error) {
      return { ok: false as const, code: body.error };
    }
    await supabase.auth.signOut().catch(() => undefined);
    const { error: anonErr } = await supabase.auth.signInAnonymously();
    if (anonErr) {
      setSession(null);
      setProfile(null);
      return { ok: true as const };
    }
    setProfile(null);
    return { ok: true as const };
  }, []);

  const setUsernameViaEdge = useCallback(
    async (username: string) => {
      const { data, error } = await supabase.functions.invoke('set-username', {
        body: { username },
      });
      if (error instanceof FunctionsHttpError) {
        try {
          const errBody = (await error.context.json()) as { error?: string };
          const code = errBody?.error;
          if (typeof code === 'string') return { ok: false as const, code };
        } catch {
          //
        }
        return { ok: false as const, code: 'network' };
      }
      if (error) {
        return { ok: false as const, code: 'network' };
      }
      const body = data as { error?: string; ok?: boolean } | null;
      if (body && typeof body === 'object' && body.error) {
        return { ok: false as const, code: body.error };
      }
      await refreshProfile();
      return { ok: true as const };
    },
    [refreshProfile]
  );

  const user = session?.user ?? null;
  const isGuest = isGuestUser(user);
  const needsUsername = Boolean(user && !isGuest && !profile?.username);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      isGuest,
      needsUsername,
      signOut,
      deleteAccount,
      refreshProfile,
      setUsernameViaEdge,
    }),
    [session, user, profile, loading, isGuest, needsUsername, signOut, deleteAccount, refreshProfile, setUsernameViaEdge]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
