import { AiOverview } from './aiOverviewCache';

/**
 * Calculates a unified "Platebound Score" from 0-10 based on AI ratings and Google data.
 * 
 * Weights:
 * - Google Rating (0-5 -> 0-10): 25% (Heavily weighted)
 * - Price Score (0-4 -> 0-10): 15% (Heavily weighted, favoring value)
 * - Health Score (0-10): 20%
 * - Workout Recovery (0-10): 15%
 * - Processed Score (0-10): 10%
 * - Protein Score (0-5 -> 0-10): 10%
 * - Speed Score (0-5 -> 0-10): 2.5%
 * - Noise Level (0-5 -> 0-10): 2.5% (Inverted)
 */
export function calculatePlateboundScore(
  overview: AiOverview | undefined | null,
  googleRating?: number,
  priceLevel?: string
): number {
  if (!overview) return 0;

  const weights = {
    googleRating: 0.25,
    price: 0.15,
    health: 0.20,
    workout: 0.15,
    processed: 0.10,
    protein: 0.10,
    speed: 0.025,
    noise: 0.025,
  };

  // Normalize Google Rating (0-5)
  const normGoogle = (googleRating || 0) * 2;

  // Map Price Level to 0-10 score (Favoring value)
  let priceScore = 7; // Default to moderate
  if (priceLevel) {
    switch (priceLevel) {
      case 'PRICE_LEVEL_FREE': priceScore = 10; break;
      case 'PRICE_LEVEL_INEXPENSIVE': priceScore = 10; break;
      case 'PRICE_LEVEL_MODERATE': priceScore = 8; break;
      case 'PRICE_LEVEL_EXPENSIVE': priceScore = 4; break;
      case 'PRICE_LEVEL_VERY_EXPENSIVE': priceScore = 1; break;
    }
  }

  // Normalize 0-5 scores from AI
  const normProtein = (overview.proteinScore || 0) * 2;
  const normSpeed = (overview.speedScore || 0) * 2;
  
  // Invert and normalize noise (0-5, where 5 is most noisy)
  const normNoise = (5 - (overview.noiseLevelEstimate || 0)) * 2;

  const weightedScore = 
    (normGoogle * weights.googleRating) +
    (priceScore * weights.price) +
    ((overview.healthScore || 0) * weights.health) +
    ((overview.workoutRecoveryScore || 0) * weights.workout) +
    ((overview.processedScore || 0) * weights.processed) +
    (normProtein * weights.protein) +
    (normSpeed * weights.speed) +
    (normNoise * weights.noise);

  return Math.round(weightedScore * 10) / 10;
}
