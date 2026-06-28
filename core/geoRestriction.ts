/**
 * Geo-Restriction Module
 * Prevents initiating expensive API calls on remote unpopulated coordinates (0 population / middle of nowhere).
 */

const populationCheckCache = new Map<string, boolean>();

export async function checkIsPopulatedArea(lat: number, lng: number): Promise<boolean> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

  // Round to ~2 decimal places (~1.1 km precision) to cache population checks across nearby movements
  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  if (populationCheckCache.has(cacheKey)) {
    return populationCheckCache.get(cacheKey)!;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (!res.ok) {
      return true; // Fail open if geocoding service returns an error
    }

    const data = await res.json();

    // 1. If no countryCode is returned, location is in open ocean, international waters, or Antarctica
    if (!data.countryCode || String(data.countryCode).trim() === '') {
      populationCheckCache.set(cacheKey, false);
      return false;
    }

    // 2. Check informative tags for explicit uninhabited / desert / ocean / sea keywords if no city/town
    const informativeDesc = (Array.isArray(data.localityInfo?.informative) ? data.localityInfo.informative : [])
      .map((i: any) => `${i.name || ''} ${i.description || ''}`.toLowerCase())
      .join(' ');

    const hasCityOrLocality = Boolean(
      (data.city && String(data.city).trim() !== '') ||
      (data.locality && String(data.locality).trim() !== '' && !String(data.locality).toLowerCase().includes('ocean') && !String(data.locality).toLowerCase().includes('sea')) ||
      (data.postcode && String(data.postcode).trim() !== '')
    );

    if (!hasCityOrLocality) {
      if (
        informativeDesc.includes('desert') ||
        informativeDesc.includes('ocean') ||
        informativeDesc.includes('sea') ||
        informativeDesc.includes('forest') ||
        informativeDesc.includes('wilderness') ||
        informativeDesc.includes('uninhabited')
      ) {
        populationCheckCache.set(cacheKey, false);
        return false;
      }
    }

    populationCheckCache.set(cacheKey, true);
    return true;
  } catch {
    // Fail open on network errors or timeout so valid searches aren't broken offline/low signal
    return true;
  }
}
