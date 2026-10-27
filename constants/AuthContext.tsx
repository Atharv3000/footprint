import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform, Alert } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { loadUserProfile, saveUserProfile, UserProfile, DEFAULT_PROFILE } from './userProfile';

// Required for expo-auth-session on iOS
WebBrowser.maybeCompleteAuthSession();

// ─────────────────────────────────────────────
// GOOGLE OAUTH CONFIG
// Replace with your own Client ID from Google Cloud Console:
// https://console.cloud.google.com → APIs & Services → Credentials → Create OAuth 2.0 Client (Web type)
const GOOGLE_CLIENT_ID = '85716154669-004m892q2vv1gu1noliffii38r99ujep.apps.googleusercontent.com';

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

// ─────────────────────────────────────────────
// Secure credential storage keys
const EMAIL_ACCOUNTS_KEY = 'footprint_email_accounts';

interface EmailAccount {
  email: string;
  passwordHash: string;
  name: string;
}

async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, password);
}

import AsyncStorage from '@react-native-async-storage/async-storage';

async function loadEmailAccounts(): Promise<EmailAccount[]> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web') {
      raw = await AsyncStorage.getItem(EMAIL_ACCOUNTS_KEY);
    } else {
      raw = await SecureStore.getItemAsync(EMAIL_ACCOUNTS_KEY);
    }
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveEmailAccounts(accounts: EmailAccount[]): Promise<void> {
  const data = JSON.stringify(accounts);
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(EMAIL_ACCOUNTS_KEY, data);
  } else {
    await SecureStore.setItemAsync(EMAIL_ACCOUNTS_KEY, data);
  }
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
  signInWithGoogleDemo: (customEmail?: string, customName?: string) => Promise<void>;
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

  // Google OAuth request setup
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'footprint' });
  const [googleRequest, googleResponse, promptGoogleAsync] = GOOGLE_CLIENT_ID
    ? AuthSession.useAuthRequest(
        {
          clientId: GOOGLE_CLIENT_ID,
          scopes: ['openid', 'profile', 'email'],
          redirectUri,
        },
        GOOGLE_DISCOVERY
      )
    : [null, null, null];

  // Load persisted auth on mount
  useEffect(() => {
    (async () => {
      try {
        const p = await loadUserProfile();
        setProfile(p);
        if (p.isLoggedIn && p.email && p.authProvider !== 'guest') {
          setUser({
            id: p.email,
            name: p.name,
            email: p.email,
            provider: p.authProvider as AuthUser['provider'],
          });
        }
        const appleAvailable = await AppleAuthentication.isAvailableAsync();
        setIsAppleAvailable(appleAvailable);
      } catch (e) {
        console.error('Auth init failed', e);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Handle Google OAuth response
  useEffect(() => {
    if (googleResponse?.type === 'success') {
      const { authentication } = googleResponse;
      if (authentication?.accessToken) {
        fetchGoogleUserInfo(authentication.accessToken);
      }
    }
  }, [googleResponse]);

  const fetchGoogleUserInfo = async (accessToken: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      const name = data.name || 'Google User';
      const email = data.email || '';
      await persistSignIn({ name, email, provider: 'google' });
    } catch (e) {
      Alert.alert('Google Sign In', 'Failed to fetch your Google profile. Please try again.');
    }
  };

  const persistSignIn = async ({
    name, email, provider,
  }: { name: string; email: string; provider: AuthUser['provider'] }) => {
    const newUser: AuthUser = { id: email, name, email, provider };
    const updatedProfile: UserProfile = {
      ...profile,
      isLoggedIn: true,
      name,
      email,
      authProvider: provider === 'email' ? 'guest' : provider as 'apple' | 'google',
      hasCompletedSetup: true,
    };
    setUser(newUser);
    setProfile(updatedProfile);
    await saveUserProfile(updatedProfile);
  };

  const signInWithGoogleDemo = useCallback(async (customEmail?: string, customName?: string) => {
    const email = customEmail || 'developer.footprint@gmail.com';
    const name = customName || 'Google User';
    await persistSignIn({ name, email, provider: 'google' });
  }, [profile]);

  const signInWithApple = useCallback(async () => {
    try {
      if (Platform.OS !== 'ios') {
        Alert.alert('Apple Sign In', 'Apple Sign In is only available on iOS devices.');
        return;
      }
      const isAvailable = await AppleAuthentication.isAvailableAsync().catch(() => false);
      if (!isAvailable) {
        // In Expo Go or simulator, native Apple Authentication may not be enabled in the development client sandbox
        Alert.alert(
          'Apple Sign In (Development)',
          'Apple Authentication requires a standalone build or development client with Apple Developer capabilities configured.\n\nFor testing in Expo Go, you can sign in with Email/Password or continue as Guest.',
          [{ text: 'OK' }]
        );
        return;
      }
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const name =
        credential.fullName?.givenName || credential.fullName?.familyName
          ? `${credential.fullName?.givenName || ''} ${credential.fullName?.familyName || ''}`.trim()
          : 'Apple User';
      const email = credential.email || `${credential.user}@privaterelay.appleid.com`;
      await persistSignIn({ name, email, provider: 'apple' });
    } catch (e: any) {
      if (e.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple Sign In', e?.message || 'Apple Sign In failed.');
    }
  }, [profile]);

  const signInWithGoogle = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID || !promptGoogleAsync) {
      // Direct sandbox authorization if not configured
      await persistSignIn({ name: 'Google User', email: 'user@gmail.com', provider: 'google' });
      return;
    }
    try {
      const res = await promptGoogleAsync();
      if (res?.type === 'dismiss' || res?.type === 'cancel') {
        return;
      }
      if (res?.type === 'error') {
        throw new Error(res.error?.message || 'Google OAuth failed');
      }
    } catch (err: any) {
      // Re-throw so caller (sign-in screen) can show friendly fallback modal or handle
      throw err;
    }
  }, [promptGoogleAsync, profile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const accounts = await loadEmailAccounts();
    const hash = await hashPassword(password);
    const account = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (!account) {
      throw new Error('No account found with this email. Please sign up first.');
    }
    if (account.passwordHash !== hash) {
      throw new Error('Incorrect password. Please try again.');
    }
    await persistSignIn({ name: account.name, email: account.email, provider: 'email' });
  }, [profile]);

  const signUpWithEmail = useCallback(async (name: string, email: string, password: string) => {
    if (!name.trim()) throw new Error('Please enter your name.');
    if (!email.includes('@')) throw new Error('Please enter a valid email address.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');

    const accounts = await loadEmailAccounts();
    const exists = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());
    if (exists) throw new Error('An account with this email already exists. Please sign in.');

    const hash = await hashPassword(password);
    accounts.push({ email: email.toLowerCase(), passwordHash: hash, name: name.trim() });
    await saveEmailAccounts(accounts);
    await persistSignIn({ name: name.trim(), email: email.toLowerCase(), provider: 'email' });
  }, [profile]);

  const signOut = useCallback(async () => {
    const updated: UserProfile = {
      ...profile,
      isLoggedIn: false,
      authProvider: 'guest',
      name: 'Walker',
      email: 'walker@footprint.app',
    };
    setUser(null);
    setProfile(updated);
    await saveUserProfile(updated);
  }, [profile]);

  const updateProfile = useCallback(async (updates: Partial<UserProfile>) => {
    const updated = { ...profile, ...updates };
    if (updates.name && user) {
      setUser({ ...user, name: updates.name });
    }
    setProfile(updated);
    await saveUserProfile(updated);
  }, [profile, user]);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isLoading,
      isAppleAvailable,
      isGoogleConfigured: !!GOOGLE_CLIENT_ID,
      signInWithApple,
      signInWithGoogle,
      signInWithGoogleDemo,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
