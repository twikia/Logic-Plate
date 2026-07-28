import type { AiOverview } from './aiOverviewCache';

/**
 * Calculates a unified "Platebound Score" from 0-10 based on AI overview data.
 */
export function calculatePlateboundScore(
  overview: AiOverview | undefined | null,
  priceLevel?: string,
  priceTier?: number | null
): number {
  if (!overview) return 0;

  const weights = {
    price: 0.2,
    health: 0.267,
    workout: 0.2,
    processed: 0.133,
    protein: 0.133,
    speed: 0.033,
    noise: 0.033,
  };

  let priceScore = 7;
  if (priceLevel) {
    switch (priceLevel) {
      case 'PRICE_LEVEL_FREE': priceScore = 10; break;
      case 'PRICE_LEVEL_INEXPENSIVE': priceScore = 10; break;
      case 'PRICE_LEVEL_MODERATE': priceScore = 8; break;
      case 'PRICE_LEVEL_EXPENSIVE': priceScore = 4; break;
      case 'PRICE_LEVEL_VERY_EXPENSIVE': priceScore = 1; break;
    }
  } else if (priceTier != null) {
    switch (priceTier) {
      case 1: priceScore = 10; break;
      case 2: priceScore = 8; break;
      case 3: priceScore = 4; break;
      case 4: priceScore = 1; break;
    }
  }

  const normProtein = (overview.proteinScore || 0) * 2;
  const normSpeed = (overview.speedScore || 0) * 2;
  const normNoise = (5 - (overview.noiseLevelEstimate || 0)) * 2;

  const weightedScore =
    (priceScore * weights.price) +
    ((overview.healthScore || 0) * weights.health) +
    ((overview.workoutRecoveryScore || 0) * weights.workout) +
    ((overview.processedScore || 0) * weights.processed) +
    (normProtein * weights.protein) +
    (normSpeed * weights.speed) +
    (normNoise * weights.noise);

  return Math.round(weightedScore * 10) / 10;
}
