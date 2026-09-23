// Shared region-resolution hook — determines whether a visitor should see
// UK or Nigeria pricing, so pages never show both regions' prices at once.
//
// Resolution order mirrors src/pages/pricing.tsx: signed-in user's saved
// profile country first (most authoritative), falling back to IP-based
// geolocation (/api/geo), and finally defaulting to UK if neither resolves
// (e.g. still loading, or the visitor is outside both supported regions).
//
// IMPORTANT: once a region has been resolved for this browser session, it is
// cached (sessionStorage) and reused as-is on every subsequent mount of this
// hook (including on other pages during the same visit). This guarantees a
// visitor is never shown one region's info and then, moments later, another
// region's — the resolution race (geo vs. profile, or a slow/flaky network)
// only gets to run once per session.
import { useEffect, useState } from 'react';
import { getValidSession } from '@/lib/session';

export type PricingRegion = 'UK' | 'NG';

type GeoResponse = { region?: PricingRegion | 'BOTH' };
type ProfileResponse = { success?: boolean; data?: { country?: string | null } };

const SESSION_CACHE_KEY = 'padihub.pricingRegion';

function normalizeProfileCountry(country?: string | null): PricingRegion | null {
  if (country === 'NG') return 'NG';
  if (country === 'GB' || country === 'UK') return 'UK';
  return null;
}

function fallbackRegionFromGeo(region?: PricingRegion | 'BOTH'): PricingRegion {
  return region === 'NG' ? 'NG' : 'UK';
}

function readCachedRegion(): PricingRegion | null {
  try {
    const cached = window.sessionStorage.getItem(SESSION_CACHE_KEY);
    return cached === 'NG' || cached === 'UK' ? cached : null;
  } catch {
    // sessionStorage can throw in locked-down/private-browsing contexts —
    // treat as uncached rather than failing region resolution entirely.
    return null;
  }
}

function writeCachedRegion(region: PricingRegion): void {
  try {
    window.sessionStorage.setItem(SESSION_CACHE_KEY, region);
  } catch {
    // Ignore — caching is a best-effort consistency guard, not a requirement.
  }
}

/**
 * Resolves the visitor's pricing region (UK or Nigeria). Only fetches after
 * hydration (inside useEffect) so SSR/first client render always agree on
 * the 'UK' default, avoiding hydration mismatches.
 */
export function useResolvedPricingRegion(): PricingRegion {
  const [region, setRegion] = useState<PricingRegion>('UK');

  useEffect(() => {
    // Once this session has already resolved a region (on this or any other
    // page), reuse it immediately and skip re-resolving — the visitor's
    // location has been captured and must not be re-guessed differently.
    const cachedRegion = readCachedRegion();
    if (cachedRegion) {
      setRegion(cachedRegion);
      return;
    }

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
      const resolvedRegion = profileRegion ?? fallbackRegionFromGeo(geo?.region);
      writeCachedRegion(resolvedRegion);
      setRegion(resolvedRegion);
    });

    return () => {
      active = false;
    };
  }, []);

  return region;
}
