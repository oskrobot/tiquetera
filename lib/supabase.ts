// lib/supabase.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import 'react-native-url-polyfill/auto';

// Expo SDKs recientes: extra puede venir de distintos campos
const extra =
  (Constants.expoConfig?.extra as any) ||
  (Constants.manifest2?.extra as any) || // fallback en algunos entornos
  {};

const supabaseUrl: string | undefined = extra.supabaseUrl;
const supabaseAnonKey: string | undefined = extra.supabaseAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  // No rompe el bundle; solo avisa en consola
  console.warn(
    '⚠️ Falta supabaseUrl o supabaseAnonKey en app.json → expo.extra'
  );
}

export const supabase = createClient(supabaseUrl!, supabaseAnonKey!, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});