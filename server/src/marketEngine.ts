/**
 * CardDrop P2P Marketplace Engine
 * Handles listing durations, fee calculation (3%), and market pricing recommendations.
 */

export const MARKET_FEE_PERCENT = 3.0; // 3% fee withheld from seller
export const LISTING_DURATION_DAYS = 7; // 7 days active duration

export interface MarketFeeResult {
  price: number;
  feePercent: number;
  feeCoins: number;
  netPayout: number;
}

export interface RecommendedPriceResult {
  recommendedMin: number;
  recommendedMax: number;
  avgPrice: number;
  hasSufficientHistory: boolean;
  pastDealsCount: number;
}

/**
 * Calculate market fee and net payout for seller
 */
export function calculateMarketFee(price: number): MarketFeeResult {
  const normalizedPrice = Math.max(1, Math.floor(price));
  const feeCoins = Math.max(1, Math.round((normalizedPrice * MARKET_FEE_PERCENT) / 100));
  const netPayout = Math.max(1, normalizedPrice - feeCoins);

  return {
    price: normalizedPrice,
    feePercent: MARKET_FEE_PERCENT,
    feeCoins,
    netPayout,
  };
}

/**
 * Material baseline multiplier for pricing estimation
 */
const MATERIAL_PRICE_MULTIPLIERS: Record<string, number> = {
  'Classic Plastic': 1.0,
  'Matte Plastic': 1.6,
  'Gold': 4.5,
  'Black Carbon': 7.0,
  'Titanium': 12.0,
  'Holographic': 18.0,
};

const CATEGORY_PRICE_MULTIPLIERS: Record<string, number> = {
  Standard: 1.0,
  Pair: 1.3,
  Triple: 2.0,
  Quad: 4.0,
  Repeater: 5.0,
  Straight: 7.0,
  Mirror: 10.0,
};

/**
 * Calculates recommended price range based on past completed deals or card score & attributes
 */
export function calculateRecommendedPrice(
  card: { collector_score?: number; material?: string; category?: string; bank?: string },
  pastDeals: any[] = []
): RecommendedPriceResult {
  // Find past deals matching material and category
  const matchingDeals = pastDeals.filter(
    (d) =>
      d.card_material === card.material &&
      d.card_category === card.category
  );

  if (matchingDeals.length >= 2) {
    const prices = matchingDeals.map((d) => Number(d.price)).filter((p) => !isNaN(p) && p > 0);
    const sum = prices.reduce((acc, p) => acc + p, 0);
    const avg = Math.round(sum / prices.length);
    const min = Math.min(...prices);
    const max = Math.max(...prices);

    return {
      recommendedMin: Math.max(100, Math.round(min * 0.9)),
      recommendedMax: Math.max(min, Math.round(max * 1.15)),
      avgPrice: avg,
      hasSufficientHistory: true,
      pastDealsCount: matchingDeals.length,
    };
  }

  // Fallback heuristic based on collector score, material and category rarity
  const matMult = MATERIAL_PRICE_MULTIPLIERS[card.material || ''] || 1.0;
  const catMult = CATEGORY_PRICE_MULTIPLIERS[card.category || ''] || 1.0;
  const score = Math.max(10, Number(card.collector_score) || 30);

  // Baseline formula: score * 10 * matMult * catMult
  const baseValue = Math.round(score * 8.5 * matMult * catMult);
  const recommendedMin = Math.max(150, Math.round(baseValue * 0.85));
  const recommendedMax = Math.max(recommendedMin + 100, Math.round(baseValue * 1.25));

  return {
    recommendedMin,
    recommendedMax,
    avgPrice: baseValue,
    hasSufficientHistory: false,
    pastDealsCount: matchingDeals.length,
  };
}

/**
 * Calculates expiration timestamp for a listing (7 days from now)
 */
export function calculateListingExpiry(days: number = LISTING_DURATION_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Check if a card is eligible to be listed on the marketplace
 */
export function isCardEligibleForListing(card: any): { eligible: boolean; reason?: string } {
  if (!card) {
    return { eligible: false, reason: 'Карта не найдена' };
  }
  if (card.is_sold) {
    return { eligible: false, reason: 'Карта уже продана' };
  }
  if (card.is_listed_on_market) {
    return { eligible: false, reason: 'Карта уже выставлена на Рынке' };
  }
  if (card.is_free_roll) {
    return {
      eligible: false,
      reason: 'Карты, полученные в бесплатном режиме (БОМЖ), не могут быть выставлены на биржу.',
    };
  }
  return { eligible: true };
}
