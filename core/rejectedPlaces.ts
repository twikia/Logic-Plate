import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

const KEY = 'rejected_dead_website_places_v1';
const MAX = 2000;

type Stored = { v: 1; ids: string[] };

let memory: Set<string> | null = null;

async function loadRaw(): Promise<Set<string>> {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      memory = new Set();
      return memory;
    }
    const parsed = JSON.parse(raw) as Stored;
    memory = new Set(
      Array.isArray(parsed?.ids) ? parsed.ids.filter((id) => typeof id === 'string') : []
    );
    return memory;
  } catch {
    memory = new Set();
    return memory;
  }
}

async function persist(ids: Set<string>): Promise<void> {
  const list = [...ids].slice(-MAX);
  memory = new Set(list);
  await AsyncStorage.setItem(KEY, JSON.stringify({ v: 1, ids: list } satisfies Stored));
}

export async function loadRejectedPlaceIds(): Promise<Set<string>> {
  const local = await loadRaw();
  try {
    const { data, error } = await supabase
      .from('v2_rejected_places')
      .select('gers_id')
      .limit(5000);
    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (typeof row?.gers_id === 'string') local.add(row.gers_id);
      }
      memory = local;
    }
  } catch {
    /* offline / table not ready */
  }
  return new Set(local);
}

export async function markRejectedPlaceIds(
  ids: string[],
  _reason: string = 'dead_website',
): Promise<void> {
  const valid = ids.filter((id) => typeof id === 'string' && id.length > 0);
  if (valid.length === 0) return;
  const current = await loadRaw();
  let changed = false;
  for (const id of valid) {
    if (!current.has(id)) {
      current.add(id);
      changed = true;
    }
  }
  if (changed) await persist(current);
}
