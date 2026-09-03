import type { Request, Response } from 'express';
import axios from 'axios';

function countryToRegion(country: string | undefined | null): 'UK' | 'NG' | 'BOTH' {
  if (!country) return 'BOTH';
  const c = country.toUpperCase();
  if (c === 'GB' || c === 'UK') return 'UK';
  if (c === 'NG') return 'NG';
  return 'BOTH';
}

// Matches RFC1918 / loopback / link-local ranges — an external geo-IP lookup
// for these is pointless (always fails or returns garbage), so we skip
// straight to the Accept-Language heuristic for local/dev traffic instead of
// wasting the request's latency budget on a doomed network call.
function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  const v = ip.replace(/^::ffff:/, '');
  return (
    v === '::1' ||
    v.startsWith('127.') ||
    v.startsWith('10.') ||
    v.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(v)
  );
}

// Best-effort, free, unauthenticated IP -> country lookup used when the
// request isn't already behind a CDN/proxy that sets a country header (e.g.
// Render, unlike Cloudflare/Vercel, does not add one). Any failure (network
// block, timeout, service down) must degrade silently to the
// Accept-Language heuristic below — it must never fail the request or make
// the client wait more than ~1.5s for a signup-page hint.
async function lookupCountryFromIp(ip: string): Promise<string | null> {
  if (isPrivateOrLocalIp(ip)) return null;
  try {
    const response = await axios.get(`https://ipwho.is/${encodeURIComponent(ip)}`, { timeout: 1500 });
    const data = response.data as { success?: boolean; country_code?: string } | undefined;
    if (data?.success && data.country_code) return data.country_code;
  } catch {
    // Ignore — network restrictions or the third-party service being down
    // must not block signup; we fall back to the heuristics below.
  }
  return null;
}

export default async function handler(req: Request, res: Response) {
  // Read Cloudflare / standard forwarded IP headers
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
    req.socket.remoteAddress ||
    '';

  // Country header set by common CDNs/proxies (Cloudflare, Vercel, Fastly,
  // App Engine). Whichever is in front of this deployment, prefer its
  // header over a network round-trip.
  const proxyCountry =
    (req.headers['cf-ipcountry'] as string | undefined) ||
    (req.headers['x-vercel-ip-country'] as string | undefined) ||
    (req.headers['fastly-country-code'] as string | undefined) ||
    (req.headers['x-appengine-country'] as string | undefined) ||
    (req.headers['x-country-code'] as string | undefined);

  // Fallback: attempt a very rough heuristic from the Accept-Language header
  const acceptLang = (req.headers['accept-language'] || '').toLowerCase();

  let region: 'UK' | 'NG' | 'BOTH';

  if (proxyCountry) {
    region = countryToRegion(proxyCountry);
  } else {
    // No CDN country header available (this is the normal case on our
    // current Render deployment) — try a real IP geolocation lookup before
    // falling back to guessing from the browser's language, which is
    // unreliable (e.g. a Nigerian user on an en-US browser locale would
    // otherwise be silently defaulted to the UK/GBP flow).
    const ipCountry = await lookupCountryFromIp(ip);
    if (ipCountry) {
      region = countryToRegion(ipCountry);
    } else if (acceptLang.includes('en-gb')) {
      region = 'UK';
    } else if (acceptLang.includes('en-ng') || acceptLang.includes('yo') || acceptLang.includes('ha') || acceptLang.includes('ig')) {
      region = 'NG';
    } else {
      region = 'BOTH';
    }
  }

  res.json({ region, ip: ip.substring(0, 20) }); // truncate IP for privacy
}
