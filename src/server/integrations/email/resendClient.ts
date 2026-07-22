import { Resend } from 'resend';

let _client: Resend | null = null;

export function getResendClient(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY environment variable is not set.');
    _client = new Resend(key);
  }
  return _client;
}

export function getFromEmail(): string {
  return process.env.RESEND_FROM_EMAIL ?? 'PadiHub <noreply@padihub.com>';
}
