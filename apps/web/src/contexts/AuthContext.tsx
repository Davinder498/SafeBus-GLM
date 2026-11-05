import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, supabaseConfigError } from '@/lib/supabase';
import { safeBusDisplayText } from '@/utils/brand';
import { useAppSurface, type AppSurface } from '@/contexts/AppSurfaceContext';
import {
  getPasswordResetRedirect,
  navigateToPasswordUpdate,
  normalizeAuthEmail,
} from '@/lib/authNavigation';

export const adminRoles = ['platform_super_admin', 'tenant_admin', 'transportation_admin'] as const;

export const allowedRoles = [...adminRoles, 'driver', 'guardian'] as const;

// Retain legacy discriminator for historical administrator records and UI
// compatibility, but isProfileRole() rejects it as a usable account role.
export type ProfileRole = (typeof allowedRoles)[number] | 'school_admin';

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
  if (role === 'guardian') return '/parent';
  // A historical school_admin account must never fall through to any portal.
  throw new Error('This individual-school administrator role has been retired.');
}

export function isRoleAllowedOnSurface(role: ProfileRole, surface: AppSurface): boolean {
  return surface === 'web'
    ? adminRoles.includes(role as (typeof adminRoles)[number])
    : role === 'driver' || role === 'guardian';
}

export function getSurfaceAccessMessage(surface: AppSurface): string {
  return surface === 'web'
    ? 'Driver and parent accounts use the SafeBus mobile app. Administrator accounts can sign in on this website.'
    : 'Administrator accounts use the SafeBus website. Driver and parent accounts can sign in in the mobile app.';
}

function getProfileErrorMessage() {
  return 'Your account is signed in, but no SafeBus profile was found. Ask an administrator to finish your profile setup.';
}

function getSessionErrorMessage() {
  return 'SafeBus could not verify your session right now. Please try signing in again.';
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const appSurface = useAppSurface();
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

  // Async work belongs to the observed session revision, not merely an account.
  // Invalidate synchronously in auth events, before React renders the new state.
  const sessionRef = useRef<Session | null>(null);
  const sessionRevision = useRef(0);
  const mounted = useRef(true);
  const isCurrentSession = useCallback(
    (revision: number) => mounted.current && revision === sessionRevision.current,
    [],
  );
  const requireCurrentSession = useCallback(
    (revision: number) => {
      if (!isCurrentSession(revision)) throw new Error('Your session changed. Please try again.');
    },
    [isCurrentSession],
  );
  const observeSession = useCallback((nextSession: Session | null, signedOut = false) => {
    const previous = sessionRef.current;
    if (
      signedOut ||
      previous?.access_token !== nextSession?.access_token ||
      previous?.user.id !== nextSession?.user.id
    ) {
      sessionRevision.current += 1;
      setProfile(null);
      setAuthError(null);
      setMfaStatus({ currentLevel: null, nextLevel: null, verifiedFactors: [] });
      setMfaLoading(false);
    }
    sessionRef.current = nextSession;
    setSession(nextSession);
    return sessionRevision.current;
  }, []);

  const refreshMfa = useCallback(async (): Promise<MfaStatus> => {
    if (!supabase) {
      throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
    }

    const revision = sessionRevision.current;
    setMfaLoading(true);
    try {
      const [assurance, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      requireCurrentSession(revision);
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
      if (isCurrentSession(revision)) setMfaLoading(false);
    }
  }, [isCurrentSession, requireCurrentSession]);

  const registerSession = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.rpc('register_current_user_session', {
      p_device_label: 'SafeBus web',
      p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent,
    });
    if (error)
      throw new Error('We could not verify this SafeBus session. Sign in again or retry shortly.');
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
      throw new Error(getProfileErrorMessage());
    }

    if (!isProfileRole(data.role)) {
      throw new Error(
        'Your SafeBus profile has an unsupported role. Ask an administrator to review your account.',
      );
    }

    return {
      ...data,
      full_name: data.full_name ? safeBusDisplayText(data.full_name) : data.full_name,
    } as Profile;
  }, []);

  const refreshProfile = useCallback(async () => {
    const userId = sessionRef.current?.user.id;
    if (!userId) {
      throw new Error('You must be signed in to load a profile.');
    }

    const revision = sessionRevision.current;
    const nextProfile = await loadProfile(userId);
    requireCurrentSession(revision);
    setProfile(nextProfile);
    setAuthError(null);
    return nextProfile;
  }, [loadProfile, requireCurrentSession]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      setAuthError(supabaseConfigError);
      return undefined;
    }

    const client = supabase;
    let active = true;
    mounted.current = true;

    async function initializeSession() {
      setLoading(true);
      const initialRevision = sessionRevision.current;
      const { data, error } = await client.auth.getSession();

      if (!active || !isCurrentSession(initialRevision)) return;

      if (error) {
        setSession(null);
        setProfile(null);
        setAuthError(getSessionErrorMessage());
        setLoading(false);
        return;
      }

      const revision = observeSession(data.session);

      if (!data.session) {
        setProfile(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      try {
        const nextProfile = await loadProfile(data.session.user.id);
        if (!active || !isCurrentSession(revision)) return;
        await Promise.all([refreshMfa(), registerSession()]);
        if (!active || !isCurrentSession(revision)) return;
        setProfile(nextProfile);
        setAuthError(null);
      } catch (profileError) {
        if (!active || !isCurrentSession(revision)) return;
        setProfile(null);
        setMfaStatus({ currentLevel: null, nextLevel: null, verifiedFactors: [] });
        setAuthError(
          profileError instanceof Error ? profileError.message : getProfileErrorMessage(),
        );
      } finally {
        if (active && isCurrentSession(revision)) setLoading(false);
      }
    }

    void initializeSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      const previousRevision = sessionRevision.current;
      const revision = observeSession(nextSession, !nextSession);

      if (event === 'PASSWORD_RECOVERY') {
        navigateToPasswordUpdate();
      }

      if (!nextSession) {
        setProfile(null);
        setAuthError(null);
        setLoading(false);
        return;
      }

      // A user update with the same token does not change session assurance.
      if (event === 'USER_UPDATED' && revision === previousRevision) return;

      // USER_UPDATED and MFA_CHALLENGE_VERIFIED can also replace the token.
      // Hydrate every non-null event after clearing any previous session state.
      setLoading(true);
      void loadProfile(nextSession.user.id)
        .then(async (nextProfile) => {
          if (!active || !isCurrentSession(revision)) return;
          await Promise.all([refreshMfa(), registerSession()]);
          if (!active || !isCurrentSession(revision)) return;
          setProfile(nextProfile);
          setAuthError(null);
        })
        .catch((profileError: unknown) => {
          if (!active || !isCurrentSession(revision)) return;
          setProfile(null);
          setAuthError(
            profileError instanceof Error ? profileError.message : getProfileErrorMessage(),
          );
        })
        .finally(() => {
          if (active && isCurrentSession(revision)) setLoading(false);
        });
    });

    return () => {
      active = false;
      mounted.current = false;
      sessionRevision.current += 1;
      subscription.unsubscribe();
    };
  }, [isCurrentSession, loadProfile, observeSession, refreshMfa, registerSession]);

  useEffect(() => {
    if (!supabase || !session) return undefined;
    const client = supabase;
    let active = true;

    async function verifyCurrentSession() {
      const revision = sessionRevision.current;
      const { data, error } = await client.rpc('is_current_user_session_active');
      if (!active || !isCurrentSession(revision) || error || data !== false) return;

      // Clear local authorization even if Auth's sign-out request fails.
      observeSession(null, true);
      setLoading(false);
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      if (!active || !mounted.current || sessionRef.current) return;
      setAuthError('This SafeBus session was revoked by an administrator. Sign in again.');
    }

    void verifyCurrentSession();
    const intervalId = window.setInterval(() => void verifyCurrentSession(), 60_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [isCurrentSession, observeSession, session]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!supabase) {
        throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
      }

      const initialRevision = sessionRevision.current;
      setAuthError(null);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizeAuthEmail(email),
        password,
      });

      if (error) {
        requireCurrentSession(initialRevision);
        observeSession(null, true);
        throw new Error(error.message);
      }

      if (!data.session) {
        throw new Error('Sign in did not return a session.');
      }

      if (
        sessionRevision.current !== initialRevision &&
        sessionRef.current?.access_token !== data.session.access_token
      ) {
        throw new Error('Your session changed. Please try again.');
      }
      if (!mounted.current) throw new Error('Your session changed. Please try again.');
      const revision = observeSession(data.session);
      const nextProfile = await loadProfile(data.session.user.id);
      requireCurrentSession(revision);
      await Promise.all([refreshMfa(), registerSession()]);
      requireCurrentSession(revision);
      setProfile(nextProfile);
      void supabase.rpc('record_own_auth_event', {
        p_action: 'auth.login',
        p_outcome: 'success',
        p_detail: {},
      });
      return nextProfile;
    },
    [loadProfile, observeSession, refreshMfa, registerSession, requireCurrentSession],
  );

  const signOut = useCallback(async () => {
    const revision = sessionRevision.current;
    if (!supabase) {
      observeSession(null, true);
      return;
    }

    if (window.SafeBusNativePush?.available) {
      await window.SafeBusNativePush.deactivate().catch(() => undefined);
    }
    requireCurrentSession(revision);
    void supabase.rpc('record_own_auth_event', {
      p_action: 'auth.logout',
      p_outcome: 'success',
      p_detail: {},
    });
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error(error.message);

    if (!mounted.current || (sessionRevision.current !== revision && sessionRef.current)) return;
    observeSession(null, true);
    setLoading(false);
    setAuthError(null);
  }, [observeSession, requireCurrentSession]);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      if (!supabase) {
        throw new Error(supabaseConfigError ?? 'Supabase is not configured.');
      }

      const { error } = await supabase.auth.resetPasswordForEmail(normalizeAuthEmail(email), {
        redirectTo: getPasswordResetRedirect(appSurface, window.location.origin),
      });

      if (error) throw new Error(error.message);
    },
    [appSurface],
  );

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
      if (!mounted.current || sessionRef.current?.user.id !== currentSession.user.id) {
        throw new Error('Your session changed. Please try again.');
      }
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
