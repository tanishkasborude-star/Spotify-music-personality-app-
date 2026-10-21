import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { authMode, supabaseAnonKey, supabaseUrl } from '../config';

let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient | undefined {
  if (authMode !== 'supabase' || !supabaseUrl || !supabaseAnonKey) return undefined;
  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      ...(Platform.OS === 'web' ? {} : { storage: AsyncStorage }),
    },
  });
  return client;
}

export async function restoreProfile() {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  return user ? { name: user.user_metadata.name || user.email?.split('@')[0] || 'Music fan', email: user.email } : null;
}

export async function signOut() {
  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }
}

export async function signIn(email: string, password: string) {
  const supabase = getSupabase();
  if (!supabase) {
    if (authMode === 'supabase') throw new Error('Add Supabase URL and anon key to mobile/.env.');
    if (email.trim().length < 3 || password.length < 4) throw new Error('Enter an email and a password of at least 4 characters.');
    return { name: email.split('@')[0] || 'Music fan', email };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { name: data.user.user_metadata.name || email.split('@')[0], email };
}

export async function signUp(email: string, password: string) {
  const supabase = getSupabase();
  if (!supabase) {
    if (authMode === 'supabase') throw new Error('Add Supabase URL and anon key to mobile/.env.');
    if (email.trim().length < 3 || password.length < 4) throw new Error('Enter an email and a password of at least 4 characters.');
    return { name: email.split('@')[0] || 'Music fan', email };
  }
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Could not create your account.');
  return { name: data.user.user_metadata.name || email.split('@')[0], email };
}
