import { prepareAccountStorage, setActiveStorageAccount } from './accountStorage';
import { initializeTutorialInstall, enrollTutorialAccount } from './onboardingStorage';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { loadUserProfile, saveUserProfile, loadAccountProfile, UserProfile, DEFAULT_PROFILE } from './userProfile';

// Required for expo-auth-session on iOS
WebBrowser.maybeCompleteAuthSession();

// Google OAuth Client ID (public OAuth identifier, configured via env)
const GOOGLE_CLIENT_ID =
  (process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '').trim() ||
  '85716154669-004m892q2vv1gu1noliffii38r99ujep.apps.googleusercontent.com';

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

async function generateNonce(): Promise<{ raw: string; hashed: string }> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

function providerFromSupabaseUser(sbUser: SupabaseUser): AuthUser['provider'] {
  const p = sbUser.app_metadata?.provider;
  if (p === 'apple' || p === 'google' || p === 'email') return p;
  return 'email';
}

function displayNameFromSupabaseUser(sbUser: SupabaseUser, fallback?: string): string {
  const meta = sbUser.user_metadata || {};
  return (
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    fallback?.trim() ||
    (sbUser.email ? sbUser.email.split('@')[0] : 'Walker')
  );
}

// ─────────────────────────────────────────────
// Auth Context
// ─────────────────────────────────────────────
interface AuthUser {
  id: string;
  name: string;
  email: string;
  provider: 'apple' | 'google' | 'email' | 'guest';
}

interface AuthContextValue {
  user: AuthUser | null;
  profile: UserProfile;
  isLoading: boolean;
  isAppleAvailable: boolean;
  isGoogleConfigured: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ─────────────────────────────────────────────
// AuthProvider
// ─────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);
  const googleNonceRef = React.useRef<string | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'footprint' });
  const [, googleResponse, promptGoogleAsync] = GOOGLE_CLIENT_ID
    ? AuthSession.useAuthRequest(
      {
        clientId: GOOGLE_CLIENT_ID,
        responseType: AuthSession.ResponseType.IdToken,
        scopes: ['openid', 'profile', 'email'],
        redirectUri,
      },
      GOOGLE_DISCOVERY
    )
    : [null, null, null];

  const hydrateAuthenticatedUser = useCallback(
    async (sbUser: SupabaseUser, overrideName?: string) => {
      const accountId = sbUser.id;
      const email = (sbUser.email || '').trim().toLowerCase();
      const provider = providerFromSupabaseUser(sbUser);
      const previous = await loadUserProfile();
      await prepareAccountStorage(accountId, previous.email || email);
      const saved = await loadAccountProfile(accountId, email);
      if (!saved || !saved.hasCompletedSetup) {
        await enrollTutorialAccount(accountId);
      }
      const resolvedName = saved?.name && saved.name !== DEFAULT_PROFILE.name
        ? saved.name
        : displayNameFromSupabaseUser(sbUser, overrideName);
      const updatedProfile: UserProfile = {
        ...(saved ?? {
          ...DEFAULT_PROFILE,
          joinedAt: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        }),
        isLoggedIn: true,
        name: resolvedName,
        email,
        authProvider: provider,
      };
      await saveUserProfile(updatedProfile, accountId);
      setActiveStorageAccount(accountId);
      setProfile(updatedProfile);
      setUser({ id: accountId, name: updatedProfile.name, email, provider });
    },
    []
  );

  // Restore verified Supabase Auth session on mount and listen for session changes
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initializeTutorialInstall().catch(() => { });
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;

        if (data.session?.user) {
          await hydrateAuthenticatedUser(data.session.user);
        } else {
          setActiveStorageAccount(null);
          setUser(null);
          setProfile(DEFAULT_PROFILE);
        }

        const appleAvailable = await AppleAuthentication.isAvailableAsync().catch(() => false);
        if (mounted) setIsAppleAvailable(appleAvailable);
      } catch (e) {
        console.error('Auth init failed', e);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        setActiveStorageAccount(null);
        setUser(null);
        setProfile(DEFAULT_PROFILE);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        await hydrateAuthenticatedUser(session.user);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [hydrateAuthenticatedUser]);

  // Handle Google OAuth ID-token response via Supabase Auth
  useEffect(() => {
    if (googleResponse?.type !== 'success') return;
    const idToken = googleResponse.params?.id_token || googleResponse.authentication?.idToken;
    if (!idToken) return;
    (async () => {
      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
          nonce: googleNonceRef.current || undefined,
        });
        googleNonceRef.current = null;
        if (error || !data.user) throw error || new Error('Google sign-in failed.');
        await hydrateAuthenticatedUser(data.user);
      } catch (e: any) {
        Alert.alert('Google Sign In', e?.message || 'Failed to verify your Google sign-in.');
      }
    })();
  }, [googleResponse, hydrateAuthenticatedUser]);

  const signInWithApple = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Authentication service is not configured.');
    }
    if (Platform.OS !== 'ios') {
      Alert.alert('Apple Sign In', 'Apple Sign In is only available on iOS devices.');
      return;
    }
    const isAvailable = await AppleAuthentication.isAvailableAsync().catch(() => false);
    if (!isAvailable) {
      Alert.alert(
        'Apple Sign In Unavailable',
        'Apple Authentication requires a standalone or development client build with Sign In with Apple enabled.'
      );
      return;
    }
    try {
      const { raw, hashed } = await generateNonce();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashed,
      });
      if (!credential.identityToken) {
        throw new Error('Apple did not return an identity token.');
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: raw,
      });
      if (error || !data.user) {
        throw error || new Error('Apple authentication could not be verified.');
      }
      const fullName =
        credential.fullName?.givenName || credential.fullName?.familyName
          ? `${credential.fullName?.givenName || ''} ${credential.fullName?.familyName || ''}`.trim()
          : undefined;
      if (fullName) {
        await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => { });
      }
      await hydrateAuthenticatedUser(data.user, fullName);
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return;
      throw e;
    }
  }, [hydrateAuthenticatedUser]);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Authentication service is not configured.');
    }
    if (!GOOGLE_CLIENT_ID || !promptGoogleAsync) {
      throw new Error('Google Sign In is not configured.');
    }
    const { raw, hashed } = await generateNonce();
    googleNonceRef.current = raw;
    const res = await promptGoogleAsync({ nonce: hashed } as any);
    if (res?.type === 'dismiss' || res?.type === 'cancel') {
      googleNonceRef.current = null;
      return;
    }
    if (res?.type === 'error') {
      googleNonceRef.current = null;
      throw new Error(res.error?.message || 'Google OAuth failed.');
    }
    if (res?.type === 'success') {
      const idToken = res.params?.id_token || res.authentication?.idToken;
      if (!idToken) {
        googleNonceRef.current = null;
        throw new Error('Google OAuth did not return a verifiable ID token.');
      }
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
        nonce: raw,
      });
      googleNonceRef.current = null;
      if (error || !data.user) {
        throw error || new Error('Google authentication could not be verified.');
      }
      await hydrateAuthenticatedUser(data.user);
    }
  }, [promptGoogleAsync, hydrateAuthenticatedUser]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) {
        throw new Error('Authentication service is not configured.');
      }
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        throw new Error('Please enter your email and password.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        throw new Error(error.message || 'Incorrect email or password.');
      }
      if (!data.session || !data.user) {
        throw new Error('Sign in did not return an active session. Please verify your email and try again.');
      }
      await hydrateAuthenticatedUser(data.user);
    },
    [hydrateAuthenticatedUser]
  );

  const signUpWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      if (!isSupabaseConfigured) {
        throw new Error('Authentication service is not configured.');
      }
      const cleanName = name.trim();
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanName) throw new Error('Please enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        throw new Error('Please enter a valid email address.');
      }
      if (password.length < 8) {
        throw new Error('Password must be at least 8 characters.');
      }

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          emailRedirectTo: redirectUri,
          data: { full_name: cleanName },
        },
      });
      if (error) {
        throw new Error(error.message || 'Could not create account.');
      }
      if (!data.session || !data.user) {
        throw new Error('Account created! Please confirm your email via the link we sent before signing in.');
      }
      await hydrateAuthenticatedUser(data.user, cleanName);
    },
    [hydrateAuthenticatedUser]
  );

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Clear local session state even if network signOut fails
    }
    const updated = { ...DEFAULT_PROFILE };
    await saveUserProfile(updated);
    setActiveStorageAccount(null);
    setUser(null);
    setProfile(updated);
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>) => {
      const updated = { ...profile, ...updates };
      await saveUserProfile(updated, user?.id);
      if (updates.name && user) {
        setUser({ ...user, name: updates.name });
      }
      setProfile(updated);
    },
    [profile, user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAppleAvailable,
        isGoogleConfigured: !!GOOGLE_CLIENT_ID,
        signInWithApple,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
