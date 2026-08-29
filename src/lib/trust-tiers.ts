// Trust Score™ tier definitions, shared between the Dashboard and Trust
// Score pages so both always agree on the same real, backend-driven scale
// (see src/server/lib/constants.ts TRUST_SCORE_MIN/TRUST_SCORE_MAX — the
// bands below are proportional percentages of that real range, not a
// separate hardcoded 0–1000 scale).

export interface TrustTier {
  name: string;
  desc: string;
  color: string;
  min: number;
  max: number;
}

const TIER_BANDS = [
  { name: 'Explorer',           desc: 'Just getting started',        color: '#9CA3AF', from: 0,    to: 0.29 },
  { name: 'Builder',            desc: 'Building your reputation',    color: '#2eafaf', from: 0.30, to: 0.49 },
  { name: 'Trusted',            desc: 'Consistently reliable',       color: '#2EAF6F', from: 0.50, to: 0.69 },
  { name: 'Respected',          desc: 'Highly regarded member',      color: '#F59E0B', from: 0.70, to: 0.84 },
  { name: 'Leader',             desc: 'Community leader',            color: '#8B5CF6', from: 0.85, to: 0.94 },
  { name: 'Community Champion', desc: 'Elite community champion',    color: '#EF4444', from: 0.95, to: 1.00 },
] as const;

/** Builds the tier table for a given real trust-score max (e.g. 100). */
export function getTrustTiers(max: number): TrustTier[] {
  return TIER_BANDS.map((band, index) => ({
    name: band.name,
    desc: band.desc,
    color: band.color,
    min: index === 0 ? 0 : Math.round(band.from * max),
    max: index === TIER_BANDS.length - 1 ? max : Math.round(band.to * max),
  }));
}

/** Finds the tier a given score falls into (falls back to the lowest tier). */
export function getCurrentTier(score: number, tiers: TrustTier[]): TrustTier {
  return tiers.find(tier => score >= tier.min && score <= tier.max) ?? tiers[0];
}
