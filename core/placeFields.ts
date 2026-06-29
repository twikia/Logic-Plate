export function getPlaceName(place: any): string {
  return place?.name || place?.displayName?.text || '';
}

export function getPlaceWebsiteUrl(place: any): string | undefined {
  const url = place?.website_url || place?.websiteUri;
  return typeof url === 'string' && url.length > 0 ? url : undefined;
}

export function getPlacePhone(place: any): string | undefined {
  const phone = place?.phone || place?.nationalPhoneNumber;
  return typeof phone === 'string' && phone.length > 0 ? phone : undefined;
}

export function getPlaceAddress(place: any): string | undefined {
  const addr = place?.address || place?.formattedAddress;
  return typeof addr === 'string' && addr.length > 0 ? addr : undefined;
}

export function getPlacePrimaryType(place: any): string {
  return String(place?.primaryType || place?.category || 'restaurant').toLowerCase();
}

export function getPlaceCuisineKey(place: any): string | undefined {
  return (
    place?.cuisineKey ||
    place?.aiOverview?.cuisineKey ||
    place?.category?.replace(/_restaurant$/, '') ||
    place?.primaryType?.replace(/_restaurant$/, '') ||
    undefined
  );
}

export function getPlacePriceTier(place: any): number | undefined {
  const tier = place?.priceTier ?? place?.aiOverview?.priceTier;
  return typeof tier === 'number' && tier >= 1 && tier <= 4 ? tier : undefined;
}

export function getPlaceWeekdayDescriptions(place: any): string[] | undefined {
  const fromCurrent = place?.currentOpeningHours?.weekdayDescriptions;
  if (Array.isArray(fromCurrent) && fromCurrent.length > 0) return fromCurrent;
  const fromRegular = place?.regularOpeningHours?.weekdayDescriptions;
  if (Array.isArray(fromRegular) && fromRegular.length > 0) return fromRegular;
  return undefined;
}
