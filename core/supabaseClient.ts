import 'react-native-url-polyfill/auto';
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

// Use placeholder strings if keys are missing to prevent constructor crash
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);
