import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';

export type AiOverview = {
  summaryGoodBad: string;
  speedScore: number;
  healthScore: number;
  workoutRecoveryScore: number;
  processedScore: number;
  calorieScore: number;
  proteinScore: number;
  carbScore: number;
  dateWorthiness: number;
  noiseLevelEstimate: number;
  groupSizeSweetSpot: number;
  absoluteMacros: string;
  whoThisPlaceIsFor: string;
};

type AiOverviewRow = {
  place_id: string;
  summary_good_bad: string | null;
  speed_score: number | null;
  health_score: number | null;
  workout_recovery_score: number | null;
  processed_score: number | null;
  calorie_score: number | null;
  protein_score: number | null;
  carb_score: number | null;
  date_worthiness: number | null;
  noise_level_estimate: number | null;
  group_size_sweet_spot: number | null;
  absolute_macros: string | null;
  who_this_place_is_for: string | null;
};

type PlaceSeed = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  priceLevel?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesVegetarianFood?: boolean;
  servesVeganFood?: boolean;
  servesWine?: boolean;
  servesBeer?: boolean;
  servesCocktails?: boolean;
  servesDessert?: boolean;
  servesCoffee?: boolean;
  goodForChildren?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  dineIn?: boolean;
  curbsidePickup?: boolean;
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
  parkingOptions?: {
    freeParkingLot?: boolean;
    freeStreetParking?: boolean;
    valetParking?: boolean;
    paidGarageParking?: boolean;
    paidStreetParking?: boolean;
  };
  editorialSummary?: { text?: string };
  allowsDogs?: boolean;
  // New fields
  reviews?: { relativePublishTimeDescription?: string; text?: { text?: string }; rating?: number }[];
  servesBrunch?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  liveMusic?: boolean;
  menuForChildren?: boolean;
  outdoorSeating?: boolean;
  reservable?: boolean;
  restroom?: boolean;
  accessibilityOptions?: {
    wheelchairAccessibleParking?: boolean;
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
  };
  priceRange?: {
    startPrice?: { units?: string; nanos?: number; currencyCode?: string };
    endPrice?: { units?: string; nanos?: number; currencyCode?: string };
  };
};

const localMemory = new Map<string, AiOverview>();

const normalizeOverview = (row: AiOverviewRow): AiOverview | null => {
  if (!row.summary_good_bad || !row.absolute_macros || !row.who_this_place_is_for) return null;
  if (
    row.speed_score === null ||
    row.health_score === null ||
    row.workout_recovery_score === null ||
    row.processed_score === null ||
    row.calorie_score === null ||
    row.protein_score === null ||
    row.carb_score === null ||
    row.date_worthiness === null ||
    row.noise_level_estimate === null ||
    row.group_size_sweet_spot === null
  ) {
    return null;
  }

  return {
    summaryGoodBad: row.summary_good_bad,
    speedScore: row.speed_score,
    healthScore: row.health_score,
    workoutRecoveryScore: row.workout_recovery_score,
    processedScore: row.processed_score,
    calorieScore: row.calorie_score,
    proteinScore: row.protein_score,
    carbScore: row.carb_score,
    dateWorthiness: row.date_worthiness,
    noiseLevelEstimate: row.noise_level_estimate,
    groupSizeSweetSpot: row.group_size_sweet_spot,
    absoluteMacros: row.absolute_macros,
    whoThisPlaceIsFor: row.who_this_place_is_for,
  };
};

const fromStorage = (value: string | null): AiOverview | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as AiOverview;
    if (!parsed?.summaryGoodBad) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const getAiOverviewsForPlaces = async (
  places: PlaceSeed[]
): Promise<Map<string, AiOverview>> => {
  const result = new Map<string, AiOverview>();
  const uniquePlaces = Array.from(new Map(places.filter(p => p?.id).map(p => [p.id, p])).values());
  if (uniquePlaces.length === 0) return result;

  const placeIds = uniquePlaces.map(p => p.id);
  const needsStorage: string[] = [];

  for (const placeId of placeIds) {
    const memo = localMemory.get(placeId);
    if (memo) {
      result.set(placeId, memo);
    } else {
      needsStorage.push(placeId);
    }
  }

  if (needsStorage.length > 0) {
    const pairs = await AsyncStorage.multiGet(needsStorage.map(id => `ai_overview_${id}`));
    const needsDb: string[] = [];
    for (const [key, value] of pairs) {
      const placeId = key.replace('ai_overview_', '');
      const overview = fromStorage(value);
      if (overview) {
        localMemory.set(placeId, overview);
        result.set(placeId, overview);
      } else {
        needsDb.push(placeId);
      }
    }

    if (needsDb.length > 0) {
      const { data, error } = await supabase
        .from('ai_overview_cache')
        .select(
          'place_id, summary_good_bad, speed_score, health_score, workout_recovery_score, processed_score, calorie_score, protein_score, carb_score, date_worthiness, noise_level_estimate, group_size_sweet_spot, absolute_macros, who_this_place_is_for'
        )
        .in('place_id', needsDb);

      if (!error && data) {
        const backfills: [string, string][] = [];
        const foundDbIds = new Set<string>();
        const incompleteDbIds = new Set<string>();

        for (const row of data as AiOverviewRow[]) {
          foundDbIds.add(row.place_id);
          const normalized = normalizeOverview(row);
          if (!normalized) {
            incompleteDbIds.add(row.place_id);
            continue;
          }
          localMemory.set(row.place_id, normalized);
          result.set(row.place_id, normalized);
          backfills.push([`ai_overview_${row.place_id}`, JSON.stringify(normalized)]);
        }

        if (backfills.length > 0) {
          AsyncStorage.multiSet(backfills).catch(() => undefined);
        }

        const stillMissing = needsDb.filter(id => !result.has(id) && (!foundDbIds.has(id) || incompleteDbIds.has(id)));
        if (stillMissing.length > 0) {
          const placeMap = new Map(uniquePlaces.map(p => [p.id, p]));
          const payloadPlaces = stillMissing
            .map(id => placeMap.get(id))
            .filter(Boolean)
            .map((p) => ({
              id: (p as PlaceSeed).id,
              name: (p as PlaceSeed).displayName?.text ?? '',
              formattedAddress: (p as PlaceSeed).formattedAddress ?? '',
              primaryType: (p as PlaceSeed).primaryType ?? '',
              primaryTypeDisplayName: (p as PlaceSeed).primaryTypeDisplayName?.text ?? '',
              types: (p as PlaceSeed).types ?? [],
              priceLevel: (p as PlaceSeed).priceLevel ?? '',
              rating: (p as PlaceSeed).rating ?? null,
              userRatingCount: (p as PlaceSeed).userRatingCount ?? null,
              location: (p as PlaceSeed).location ?? null,
              googleMapsUri: (p as PlaceSeed).googleMapsUri ?? '',
              websiteUri: (p as PlaceSeed).websiteUri ?? '',
              nationalPhoneNumber: (p as PlaceSeed).nationalPhoneNumber ?? '',
              businessStatus: (p as PlaceSeed).businessStatus ?? '',
              currentOpeningHours: (p as PlaceSeed).currentOpeningHours ?? null,
              regularOpeningHours: (p as PlaceSeed).regularOpeningHours ?? null,
              servesBreakfast: (p as PlaceSeed).servesBreakfast ?? null,
              servesLunch: (p as PlaceSeed).servesLunch ?? null,
              servesDinner: (p as PlaceSeed).servesDinner ?? null,
              servesVegetarianFood: (p as PlaceSeed).servesVegetarianFood ?? null,
              servesVeganFood: (p as PlaceSeed).servesVeganFood ?? null,
              servesWine: (p as PlaceSeed).servesWine ?? null,
              servesBeer: (p as PlaceSeed).servesBeer ?? null,
              servesCocktails: (p as PlaceSeed).servesCocktails ?? null,
              servesDessert: (p as PlaceSeed).servesDessert ?? null,
              servesCoffee: (p as PlaceSeed).servesCoffee ?? null,
              goodForChildren: (p as PlaceSeed).goodForChildren ?? null,
              takeout: (p as PlaceSeed).takeout ?? null,
              delivery: (p as PlaceSeed).delivery ?? null,
              dineIn: (p as PlaceSeed).dineIn ?? null,
              curbsidePickup: (p as PlaceSeed).curbsidePickup ?? null,
              paymentOptions: (p as PlaceSeed).paymentOptions ?? null,
              parkingOptions: (p as PlaceSeed).parkingOptions ?? null,
              editorialSummary: (p as PlaceSeed).editorialSummary?.text ?? '',
              allowsDogs: (p as PlaceSeed).allowsDogs ?? null,
              reviews: (p as PlaceSeed).reviews ?? [],
              servesBrunch: (p as PlaceSeed).servesBrunch ?? null,
              goodForGroups: (p as PlaceSeed).goodForGroups ?? null,
              goodForWatchingSports: (p as PlaceSeed).goodForWatchingSports ?? null,
              liveMusic: (p as PlaceSeed).liveMusic ?? null,
              menuForChildren: (p as PlaceSeed).menuForChildren ?? null,
              outdoorSeating: (p as PlaceSeed).outdoorSeating ?? null,
              reservable: (p as PlaceSeed).reservable ?? null,
              restroom: (p as PlaceSeed).restroom ?? null,
              accessibilityOptions: (p as PlaceSeed).accessibilityOptions ?? null,
              priceRange: (p as PlaceSeed).priceRange ?? null,
            }));

          if (payloadPlaces.length > 0) {
            const { data: generatedData, error: invokeError } = await supabase.functions.invoke(
              'generate-ai-overviews',
              {
                body: { places: payloadPlaces },
                headers: { 'x-app-secret': process.env.EXPO_PUBLIC_APP_SECRET || '' },
              }
            );

            if (!invokeError && generatedData?.generatedOverviews) {
              const generatedBackfills: [string, string][] = [];
              for (const item of generatedData.generatedOverviews as { placeId: string; overview: AiOverview }[]) {
                if (!item?.placeId || !item?.overview) continue;
                localMemory.set(item.placeId, item.overview);
                result.set(item.placeId, item.overview);
                generatedBackfills.push([`ai_overview_${item.placeId}`, JSON.stringify(item.overview)]);
              }
              if (generatedBackfills.length > 0) {
                AsyncStorage.multiSet(generatedBackfills).catch(() => undefined);
              }
            }
          }
        }
      }
    }
  }

  return result;
};
