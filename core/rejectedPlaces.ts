import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'rejected_dead_website_places_v1';
const MAX = 500;

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
  return new Set(await loadRaw());
}

export async function markRejectedPlaceIds(ids: string[]): Promise<void> {
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
