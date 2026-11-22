import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// SecureStore enforces a ~2048-byte limit per item on iOS/Android; chunk large JWT payloads across keys.
const CHUNK_SIZE = 1800;
const CHUNK_PREFIX = 'sb_chunk_';

const nativeSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const countRaw = await SecureStore.getItemAsync(`${CHUNK_PREFIX}${key}_count`);
      if (countRaw) {
        const count = Number(countRaw);
        if (Number.isInteger(count) && count > 0) {
          const parts: string[] = [];
          for (let i = 0; i < count; i++) {
            const part = await SecureStore.getItemAsync(`${CHUNK_PREFIX}${key}_${i}`);
            if (part === null) return null;
            parts.push(part);
          }
          return parts.join('');
        }
      }
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const prevCountRaw = await SecureStore.getItemAsync(`${CHUNK_PREFIX}${key}_count`);
      const prevCount = prevCountRaw ? Number(prevCountRaw) : 0;
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value);
        await SecureStore.deleteItemAsync(`${CHUNK_PREFIX}${key}_count`).catch(() => {});
      } else {
        const chunks = Math.ceil(value.length / CHUNK_SIZE);
        for (let i = 0; i < chunks; i++) {
          await SecureStore.setItemAsync(
            `${CHUNK_PREFIX}${key}_${i}`,
            value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
          );
        }
        await SecureStore.setItemAsync(`${CHUNK_PREFIX}${key}_count`, String(chunks));
        await SecureStore.deleteItemAsync(key).catch(() => {});
      }
      if (Number.isInteger(prevCount) && prevCount > 0) {
        const newChunks = value.length <= CHUNK_SIZE ? 0 : Math.ceil(value.length / CHUNK_SIZE);
        for (let i = newChunks; i < prevCount; i++) {
          await SecureStore.deleteItemAsync(`${CHUNK_PREFIX}${key}_${i}`).catch(() => {});
        }
      }
    } catch {
      // Do not fall back to plaintext storage for auth tokens on native devices.
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const countRaw = await SecureStore.getItemAsync(`${CHUNK_PREFIX}${key}_count`);
      const count = countRaw ? Number(countRaw) : 0;
      if (Number.isInteger(count) && count > 0) {
        for (let i = 0; i < count; i++) {
          await SecureStore.deleteItemAsync(`${CHUNK_PREFIX}${key}_${i}`).catch(() => {});
        }
        await SecureStore.deleteItemAsync(`${CHUNK_PREFIX}${key}_count`).catch(() => {});
      }
      await SecureStore.deleteItemAsync(key).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }
  },
};

export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-anon-key',
  {
    auth: {
      storage: Platform.OS === 'web' ? AsyncStorage : nativeSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);
