import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '@/lib/supabase';

export const adminRoles = [
  'platform_super_admin',
  'tenant_admin',
  'school_admin',
  'transportation_admin',
] as const;

export const allowedRoles = [...adminRoles, 'driver', 'guardian'] as const;

export type ProfileRole = (typeof allowedRoles)[number];

export interface Profile {
  id: string;
  tenant_id: string | null;
  school_id: string | null;
  full_name: string | null;
  email: string;
  role: ProfileRole;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MfaStatus {
  currentLevel: string | null;
  nextLevel: string | null;
  verifiedFactors: Array<{ id: string; friendlyName?: string; factorType: string }>;
}

export interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  authError: string | null;
  configError: string | null;
  mfaStatus: MfaStatus;
  mfaLoading: boolean;
  signIn: (email: string, password: string) => Promise<Profile>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completeInvitation: (password: string) => Promise<Profile>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<Profile>;
  refreshMfa: () => Promise<MfaStatus>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const roleSet = new Set<string>(allowedRoles);

export function isProfileRole(role: string | null | undefined): role is ProfileRole {
  return typeof role === 'string' && roleSet.has(role);
}

export function getDashboardPath(
  role: ProfileRole,
): '/admin' | '/admin/tenants' | '/driver' | '/parent' {
  if (role === 'platform_super_admin') return '/admin/tenants';
  if (adminRoles.includes(role as (typeof adminRoles)[number])) return '/admin';
  if (role === 'driver') return '/driver';
  return '/parent';
}

function getProfileErrorMessage(errorMessage?: string) {
  if (errorMessage) return errorMessage;
  return 'Your account is signed in, but no SafeBus profile was found. Ask an administrator to finish your profile setup.';
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus>({
    currentLevel: null,
    nextLevel: null,
    verifiedFactors: [],
  });
  const [mfaLoading, setMfaLoading] = useState(false);

  const refreshMfa = useCallback(async (): Promise<MfaStatus> => {
    if (!supabase) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
    }

    setMfaLoading(true);
    try {
      const [assurance, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      if (assurance.error) throw new Error(assurance.error.message);
      if (factors.error) throw new Error(factors.error.message);

      const nextStatus: MfaStatus = {
        currentLevel: assurance.data.currentLevel,
        nextLevel: assurance.data.nextLevel,
        verifiedFactors: factors.data.all
          .filter((factor) => factor.status === 'verified')
          .map((factor) => ({
            id: factor.id,
            friendlyName: factor.friendly_name,
            factorType: factor.factor_type,
          })),
      };
      setMfaStatus(nextStatus);
      return nextStatus;
    } finally {
      setMfaLoading(false);
    }
  }, []);

  const registerSession = useCallback(async () => {
    if (!supabase) return;
    await supabase.rpc('register_current_user_session', {
      p_device_label: 'SafeBus web',
      p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    });
  }, []);

  const loadProfile = useCallback(async (userId: string): Promise<Profile> => {
    if (!supabase) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, tenant_id, school_id, full_name, email, role, status, created_at, updated_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw new Error(getProfileErrorMessage(error?.message));
    }

    if (!isProfileRole(data.role)) {
      throw new Error(
        'Your SafeBus profile has an unsupported role. Ask an administrator to review your account.',
      );
    }

    return data as Profile;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) {
      throw new Error('You must be signed in to load a profile.');
    }

    const nextProfile = await loadProfile(session.user.id);
    setProfile(nextProfile);
    setAuthError(null);
    return nextProfile;
  }, [loadProfile, session?.user.id]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setAuthError(supabaseConfigError);
      return undefined;
    }

    const client = supabase;
    let active = true;

    async function initializeSession() {
      setLoading(true);
      const { data, error } = await client.auth.getSession();

      if (!active) return;

      if (error) {
        setSession(null);
        setProfile(null);
        setAuthError(error.message);
        setLoading(false);
        return;
      }

      setSession(data.session);

      if (!data.session) {
        setProfile(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await loadProfile(data.session.user.id);
        if (!active) return;
        setProfile(nextProfile);
        setAuthError(null);
        await Promise.all([refreshMfa(), registerSession()]);
      } catch (profileError) {
        if (!active) return;
        setProfile(null);
        setMfaStatus({ currentLevel: null, nextLevel: null, verifiedFactors: [] });
        setAuthError(
          profileError instanceof Error ? profileError.message : getProfileErrorMessage(),
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void initializeSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);

      if (!nextSession) {
        setProfile(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      if (
        event === 'SIGNED_IN' ||
        event === 'PASSWORD_RECOVERY' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION'
      ) {
        setLoading(true);
        void loadProfile(nextSession.user.id)
          .then(async (nextProfile) => {
            setProfile(nextProfile);
            setAuthError(null);
            await Promise.all([refreshMfa(), registerSession()]);
          })
          .catch((profileError: unknown) => {
            setProfile(null);
            setAuthError(
              profileError instanceof Error ? profileError.message : getProfileErrorMessage(),
            );
          })
          .finally(() => setLoading(false));
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, refreshMfa, registerSession]);

  useEffect(() => {
    if (!supabase || !session) return undefined;
    const client = supabase;
    let active = true;

    async function verifyCurrentSession() {
      const { data, error } = await client.rpc('is_current_user_session_active');
      if (!active || error || data !== false) return;

      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      if (!active) return;
      setSession(null);
      setProfile(null);
      setMfaStatus({ currentLevel: null, nextLevel: null, verifiedFactors: [] });
      setAuthError('This SafeBus session was revoked by an administrator. Sign in again.');
    }

    void verifyCurrentSession();
    const intervalId = window.setInterval(() => void verifyCurrentSession(), 60_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [session]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
      }

      setAuthError(null);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setSession(null);
        setProfile(null);
        throw new Error(error.message);
      }

      if (!data.session) {
        throw new Error('Sign in did not return a session.');
      }

      setSession(data.session);
      const nextProfile = await loadProfile(data.session.user.id);
      setProfile(nextProfile);
      await Promise.all([refreshMfa(), registerSession()]);
      void supabase.rpc('record_own_auth_event', {
        p_action: 'auth.login',
        p_outcome: 'success',
        p_detail: {},
      });
      return nextProfile;
    },
    [loadProfile, refreshMfa, registerSession],
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      setProfile(null);
      return;
    }

    void supabase.rpc('record_own_auth_event', {
      p_action: 'auth.logout',
      p_outcome: 'success',
      p_detail: {},
    });
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);

    setSession(null);
    setProfile(null);
    setMfaStatus({ currentLevel: null, nextLevel: null, verifiedFactors: [] });
    setAuthError(null);
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (!supabase) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) throw new Error(error.message);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
    }
    const { error: policyError } = await supabase.rpc('enforce_new_password_policy', {
      p_password: password,
    });
    if (policyError) throw new Error(policyError.message);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
    void supabase.rpc('record_own_auth_event', {
      p_action: 'auth.password_changed',
      p_outcome: 'success',
      p_detail: {},
    });
  }, []);

  const completeInvitation = useCallback(
    async (password: string) => {
      if (!supabase) {
        throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
      }
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!currentSession) {
        throw new Error(
          'This invitation session is missing or expired. Ask your administrator to resend the invitation.',
        );
      }

      const { error: policyError } = await supabase.rpc('enforce_new_password_policy', {
        p_password: password,
      });
      if (policyError) throw new Error(policyError.message);

      const { error: passwordError } = await supabase.auth.updateUser({ password });
      if (passwordError) throw new Error(passwordError.message);

      const { error: activationError } = await supabase.rpc('complete_invited_account');
      if (activationError) {
        throw new Error(
          'Your password was saved, but SafeBus could not finish activating the account. Retry this page or ask your administrator for help.',
        );
      }

      const nextProfile = await loadProfile(currentSession.user.id);
      setProfile(nextProfile);
      setAuthError(null);
      void supabase.rpc('record_own_auth_event', {
        p_action: 'auth.password_changed',
        p_outcome: 'success',
        p_detail: { invitation: true },
      });
      return nextProfile;
    },
    [loadProfile],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      authError,
      configError: supabaseConfigError,
      mfaStatus,
      mfaLoading,
      signIn,
      signOut,
      requestPasswordReset,
      completeInvitation,
      updatePassword,
      refreshProfile,
      refreshMfa,
    }),
    [
      session,
      profile,
      loading,
      authError,
      mfaStatus,
      mfaLoading,
      signIn,
      signOut,
      requestPasswordReset,
      completeInvitation,
      updatePassword,
      refreshProfile,
      refreshMfa,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
