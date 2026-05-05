import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '\n⚠️  SUPABASE CONFIGURATION MISSING!\n' +
    'Project URL or Anon Key not found in environment variables.\n' +
    'Please check your .env file.\n'
  );
}

/**
 * SSR-safe storage adapter.
 *
 * - Native (iOS/Android): uses AsyncStorage (imported lazily to avoid
 *   requiring the native module in a Node/SSR context).
 * - Web browser: uses localStorage (accessed lazily so the module-level
 *   evaluation doesn't blow up in a windowless Node environment).
 * - SSR / Node (expo export render pass): returns null so Supabase uses
 *   its built-in no-op storage and the process doesn't crash.
 */
function getStorage() {
  if (Platform.OS !== 'web') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    return AsyncStorage;
  }
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  // SSR / Node context — no persistent storage available
  return undefined;
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder',
  {
    auth: {
      storage: getStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
