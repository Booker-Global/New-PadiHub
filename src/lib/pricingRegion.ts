// Shared region-resolution hook — determines whether a visitor should see
// UK or Nigeria pricing, so pages never show both regions' prices at once.
//
// Resolution order mirrors src/pages/pricing.tsx: signed-in user's saved
// profile country first (most authoritative), falling back to IP-based
// geolocation (/api/geo), and finally defaulting to UK if neither resolves
// (e.g. still loading, or the visitor is outside both supported regions).
import { useEffect, useState } from 'react';
import { getValidSession } from '@/lib/session';

export type PricingRegion = 'UK' | 'NG';

type GeoResponse = { region?: PricingRegion | 'BOTH' };
type ProfileResponse = { success?: boolean; data?: { country?: string | null } };

function normalizeProfileCountry(country?: string | null): PricingRegion | null {
  if (country === 'NG') return 'NG';
  if (country === 'GB' || country === 'UK') return 'UK';
  return null;
}

function fallbackRegionFromGeo(region?: PricingRegion | 'BOTH'): PricingRegion {
  return region === 'NG' ? 'NG' : 'UK';
}

/**
 * Resolves the visitor's pricing region (UK or Nigeria). Only fetches after
 * hydration (inside useEffect) so SSR/first client render always agree on
 * the 'UK' default, avoiding hydration mismatches.
 */
export function useResolvedPricingRegion(): PricingRegion {
  const [region, setRegion] = useState<PricingRegion>('UK');

  useEffect(() => {
    let active = true;
    const session = getValidSession();

    const geoRequest = window.fetch('/api/geo')
      .then(response => (response.ok ? response.json() as Promise<GeoResponse> : null))
      .catch(() => null);

    const profileRequest = session?.token
      ? window.fetch('/api/users/profile', { headers: { Authorization: 'Bearer ' + session.token } })
        .then(response => (response.ok ? response.json() as Promise<ProfileResponse> : null))
        .catch(() => null)
      : Promise.resolve<ProfileResponse | null>(null);

    void Promise.all([geoRequest, profileRequest]).then(([geo, profile]) => {
      if (!active) return;
      const profileRegion = normalizeProfileCountry(profile?.data?.country);
      setRegion(profileRegion ?? fallbackRegionFromGeo(geo?.region));
    });

    return () => {
      active = false;
    };
  }, []);

  return region;
}
