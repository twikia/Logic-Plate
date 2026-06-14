import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/core/supabaseClient';

const STORAGE_KEY = 'host_group_session_id';

let activeSessionId: string | null = null;
let loaded = false;

type EndListener = () => void;
const endListeners = new Set<EndListener>();

export async function ensureHostSessionLoaded(): Promise<void> {
  if (loaded) return;
  try {
    activeSessionId = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    activeSessionId = null;
  }
  loaded = true;
}

export function getHostSessionId(): string | null {
  return activeSessionId;
}

export async function setHostSessionId(id: string): Promise<void> {
  activeSessionId = id;
  loaded = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export async function clearHostSessionId(): Promise<void> {
  activeSessionId = null;
  loaded = true;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function onHostSessionEndRequest(listener: EndListener): () => void {
  endListeners.add(listener);
  return () => {
    endListeners.delete(listener);
  };
}

export async function endHostSession(): Promise<boolean> {
  await ensureHostSessionLoaded();
  const id = activeSessionId;
  if (!id) return false;
  endListeners.forEach((fn) => fn());
  await supabase.from('group_sessions').update({ status: 'expired' }).eq('id', id);
  await clearHostSessionId();
  return true;
}
