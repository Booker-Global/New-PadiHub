import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  // Read Cloudflare / standard forwarded IP headers
  const forwarded = req.headers['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0] : undefined) ||
    req.socket.remoteAddress ||
    '';

  // Cloudflare country header (available in production)
  const cfCountry = req.headers['cf-ipcountry'] as string | undefined;

  // Fallback: attempt a very rough heuristic from the Accept-Language header
  const acceptLang = (req.headers['accept-language'] || '').toLowerCase();

  let region: 'UK' | 'NG' | 'BOTH' = 'BOTH';

  if (cfCountry) {
    if (cfCountry === 'GB') region = 'UK';
    else if (cfCountry === 'NG') region = 'NG';
    else region = 'BOTH';
  } else if (acceptLang.includes('en-gb')) {
    region = 'UK';
  } else if (acceptLang.includes('en-ng') || acceptLang.includes('yo') || acceptLang.includes('ha') || acceptLang.includes('ig')) {
    region = 'NG';
  }

  res.json({ region, ip: ip.substring(0, 20) }); // truncate IP for privacy
}
