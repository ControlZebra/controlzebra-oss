/**
 * AuthContext - Supabase authentication state + actions for ControlZebra.
 *
 * Handles:
 * - Session hydration from backend keychain
 * - Login/logout actions
 * - Session refresh + persistence
 * - Derived auth flags for UI gating
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  signIn,
  signOut,
  hydrateSession,
  refreshSession as refreshSupabaseSession,
  serialiseSession,
} from '../supabaseClient';
import {
  LoadSession,
  SaveSession,
  ClearSession,
} from '../../../../bindings/controlzebra/services/authservice';

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  userEmail: string | null;
  userName: string | null;
  authError: string | null;
  loginWithPassword: (email: string, password: string) => Promise<{ success: boolean; error: string | null }>;
  logout: () => Promise<{ success: boolean; error: string | null }>;
  refreshSession: () => Promise<{ success: boolean; error: string | null }>;
}

interface AuthProviderProps {
  children: ReactNode;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: AuthProviderProps): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const hydrateFromKeychain = useCallback(async () => {
    setIsLoading(true);
    setAuthError(null);

    try {
      const stored = await LoadSession();
      if (!stored) {
        setSession(null);
        return;
      }

      const result = await hydrateSession(stored);
      if (result.success && result.session) {
        setSession(result.session);
        await SaveSession(serialiseSession(result.session));
      } else {
        await ClearSession();
        setSession(null);
        setAuthError(result.error || 'Session expired. Please sign in again.');
      }
    } catch (err) {
      console.error('Failed to hydrate auth session:', err);
      setSession(null);
      setAuthError('Failed to load session. Please sign in again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void hydrateFromKeychain();
  }, [hydrateFromKeychain]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    try {
      const result = await signIn(email, password);
      if (result.success && result.session) {
        await SaveSession(serialiseSession(result.session));
        setSession(result.session);
        return { success: true, error: null };
      }

      setSession(null);
      const msg = result.error || 'Sign in failed';
      setAuthError(msg);
      return { success: false, error: msg };
    } catch (err) {
      console.error('Login failed:', err);
      const msg = 'An unexpected error occurred. Please try again.';
      setAuthError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError(null);
    try {
      const result = await signOut();
      await ClearSession();
      setSession(null);

      if (!result.success) {
        setAuthError(result.error || 'Sign out failed');
      }

      return result;
    } catch (err) {
      console.error('Logout failed:', err);
      // Always clear local state even if remote sign-out fails
      await ClearSession().catch(() => {});
      setSession(null);
      const msg = 'Sign out failed. Session cleared locally.';
      setAuthError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const result = await refreshSupabaseSession();
      if (result.success && result.session) {
        await SaveSession(serialiseSession(result.session));
        setSession(result.session);
        return { success: true, error: null };
      }

      if (result.error) {
        setAuthError(result.error);
      }

      return { success: false, error: result.error || 'Failed to refresh session' };
    } catch (err) {
      console.error('Session refresh failed:', err);
      const msg = 'Failed to refresh session';
      setAuthError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const userEmail = session?.user?.email ?? null;
    const userName =
      (session?.user?.user_metadata?.full_name as string | undefined) ||
      (session?.user?.user_metadata?.name as string | undefined) ||
      userEmail;

    return {
      isLoading,
      isAuthenticated: Boolean(session),
      userEmail,
      userName,
      authError,
      loginWithPassword,
      logout,
      refreshSession,
    };
  }, [session, isLoading, authError, loginWithPassword, logout, refreshSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    if (import.meta.hot) {
      import.meta.hot.invalidate('AuthContext identity changed during HMR');
      return {} as AuthContextValue;
    }
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
