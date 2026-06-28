/**
 * Normalizes restaurant payloads to ensure the database remains flat and simple,
 * without any nested pages or malformed data structures.
 */
export function normalizePlaces(raw: unknown): { places: any[]; wasModified: boolean } {
  let wasModified = false;
  if (!raw) return { places: [], wasModified: true };

  let target = raw;
  if (!Array.isArray(target)) {
    wasModified = true;
    if (target && typeof target === 'object') {
      const obj = target as Record<string, unknown>;
      if (Array.isArray(obj.restaurants)) target = obj.restaurants;
      else if (Array.isArray(obj.pages)) target = obj.pages;
      else if (Array.isArray(obj.places)) target = obj.places;
      else if (Array.isArray(obj.results)) target = obj.results;
      else return { places: [], wasModified: true };
    } else {
      return { places: [], wasModified: true };
    }
  }

  const flat: any[] = [];
  const flatten = (arr: any[]) => {
    for (const item of arr) {
      if (Array.isArray(item)) {
        wasModified = true;
        flatten(item);
      } else if (item && typeof item === 'object') {
        const place = item as Record<string, unknown>;
        if (Array.isArray(place.places)) {
          wasModified = true;
          flatten(place.places);
        } else if (place.id || place.name || place.displayName) {
          flat.push(place);
        } else {
          wasModified = true;
        }
      } else {
        wasModified = true;
      }
    }
  };
  flatten(target as any[]);

  const seen = new Set<string>();
  const deduplicated: any[] = [];
  for (const place of flat) {
    const idStr = String(place.id || place.name || '');
    if (!idStr) {
      wasModified = true;
      continue;
    }
    if (!seen.has(idStr)) {
      seen.add(idStr);
      deduplicated.push(place);
    } else {
      wasModified = true;
    }
  }

  return { places: deduplicated, wasModified };
}

/**
 * Checks rows from v2_restaurant_cell_cache. If any row has old paging structures or
 * malformed data (wasModified === true), updates the DB immediately so it is flat and simple.
 */
export async function healDatabaseRows(supabase: any, rows: any[]): Promise<Map<string, any[]>> {
  const map = new Map<string, any[]>();
  if (!rows || !Array.isArray(rows)) return map;

  for (const row of rows) {
    if (!row || !row.id) continue;
    const { places, wasModified } = normalizePlaces(row.restaurants);
    if (wasModified) {
      console.log(`[Heal DB] Fixing malformed row for cell ${row.id} -> ${places.length} places.`);
      try {
        await supabase
          .from('v2_restaurant_cell_cache')
          .upsert({
            id: row.id,
            restaurants: places,
            fetched_at: row.fetched_at || new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (err) {
        console.error(`[Heal DB] Failed to upsert healed row for cell ${row.id}:`, err);
      }
    }
    map.set(row.id, places);
  }

  return map;
}
