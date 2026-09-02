import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { loadStripe } from '@stripe/stripe-js';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  Clock,
  Shield,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  identity_verified?: boolean | null;
  identity_verified_at?: string | null;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, string[] | undefined>;
}

type IdentityVerificationStatus = 'not_started' | 'pending' | 'verified' | 'failed';

interface IdentityStatus {
  verified: boolean;
  status: IdentityVerificationStatus;
  verifiedAt?: string;
  sessionId?: string;
  bypass_available: boolean;
}

interface StripeVerificationStartResponse {
  sessionId?: string;
  clientSecret?: string;
  url?: string;
}

interface Bank {
  code: string;
  name: string;
}

interface AccountResolveResponse {
  verified?: boolean;
  accountName?: string;
  message?: string;
}

const STRIPE_PUBLISHABLE_KEY = (
  import.meta.env as Record<string, string | undefined>
).VITE_STRIPE_PUBLISHABLE_KEY?.trim() || '';

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

function getReturnPath(searchParams: { get(name: string): string | null }) {
  const candidate = searchParams.get('redirect') || searchParams.get('next') || '/dashboard';
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return '/dashboard';
  return candidate;
}

function getReturnLabel(path: string) {
  if (path === '/dashboard') return 'Go to dashboard';
  if (path === '/savings-groups/create') return 'Continue creating your group';
  if (path.includes('/join')) return 'Continue joining the group';
  return 'Continue';
}

function formatVerifiedDate(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function delay(ms: number) {
  return new Promise<void>(resolve => { window.setTimeout(resolve, ms); });
}

export default function VerifyIdentityPage() {
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState('');
  const [startLoading, setStartLoading] = useState(false);
  const [resolveLoading, setResolveLoading] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);
  const [awaitingWebhook, setAwaitingWebhook] = useState(false);
  const pollAbortRef = useRef(false);

  const returnPath = getReturnPath(searchParams);
  const returnLabel = getReturnLabel(returnPath);

  const fetchStatus = useCallback(async (): Promise<IdentityStatus | null> => {
    const session = getValidSession();
    if (!session?.token) return null;
    const response = await window.fetch('/api/identity/status', {
      headers: { Authorization: 'Bearer ' + session.token },
    });
    const json = await response.json().catch(() => null) as ApiResponse<IdentityStatus> | null;
    if (!response.ok) return null;
    return json?.data ?? null;
  }, []);

  const loadIdentityState = useCallback(async (showLoading = true) => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to verify your identity.');
      setLoading(false);
      return;
    }

    if (showLoading) setLoading(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };

      const statusResponse = await window.fetch('/api/identity/status', { headers });
      const statusJson = await statusResponse.json().catch(() => null) as ApiResponse<IdentityStatus> | null;
      if (!statusResponse.ok) {
        throw new Error(getErrorMessage(statusJson, 'Could not load your identity verification status.'));
      }

      const profileResponse = await window.fetch('/api/users/profile', { headers });
      const profileJson = await profileResponse.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!profileResponse.ok) {
        throw new Error(getErrorMessage(profileJson, 'Could not load your profile.'));
      }

      setStatus(statusJson?.data ?? null);
      setProfile(profileJson?.data ?? null);

      if (profileJson?.data?.country === 'NG' && banks.length === 0 && !banksLoading) {
        setBanksLoading(true);
        try {
          const banksResponse = await window.fetch('/api/payments/banks', { headers });
          const banksJson = await banksResponse.json().catch(() => null) as ApiResponse<Bank[]> | null;
          if (!banksResponse.ok) throw new Error(getErrorMessage(banksJson, 'Could not load the list of banks.'));
          setBanks(banksJson?.data ?? []);
        } catch (banksFetchError) {
          setBanksError(banksFetchError instanceof Error ? banksFetchError.message : 'Could not load the list of banks.');
        } finally {
          setBanksLoading(false);
        }
      }
    } catch (loadError) {
      setStatus(null);
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load your identity verification status.');
    } finally {
      if (showLoading) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadIdentityState();
    return () => { pollAbortRef.current = true; };
  }, [loadIdentityState]);

  // After the embedded Stripe Identity modal closes, the terminal
  // verified/failed result only lands via webhook (not synchronously), so
  // briefly poll for the status to move off "pending" before giving up and
  // just leaving the page showing "Pending".
  const pollForWebhookResult = async () => {
    setAwaitingWebhook(true);
    pollAbortRef.current = false;
    for (let attempt = 0; attempt < 10 && !pollAbortRef.current; attempt++) {
      await delay(2000);
      const latest = await fetchStatus();
      if (latest && latest.status !== 'pending') {
        setStatus(latest);
        break;
      }
    }
    setAwaitingWebhook(false);
    await loadIdentityState(false);
  };

  const handleStartStripeVerification = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before starting identity verification.');
      return;
    }
    if (!STRIPE_PUBLISHABLE_KEY) {
      setActionError('Stripe Identity is not configured. Please contact support.');
      return;
    }

    setStartLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/identity/verify/start', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json().catch(() => null) as ApiResponse<StripeVerificationStartResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not start Stripe Identity verification.'));
      }

      const clientSecret = json?.data?.clientSecret;
      if (!clientSecret) {
        throw new Error('The verification service did not return a client secret.');
      }

      const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
      if (!stripe) {
        throw new Error('Could not load Stripe. Please try again.');
      }

      // Embedded modal, opened directly from our own dashboard — never a
      // redirect to a separate Stripe-hosted page.
      const result = await stripe.verifyIdentity(clientSecret);
      if (result.error) {
        throw new Error(result.error.message || 'Identity verification was not completed.');
      }

      setActionNotice('Verification submitted — we\'re confirming the result now. Your card will not be charged until it succeeds.');
      await loadIdentityState(false);
      await pollForWebhookResult();
    } catch (startError) {
      setActionError(startError instanceof Error ? startError.message : 'Could not start Stripe Identity verification.');
    } finally {
      setStartLoading(false);
    }
  };

  const handleResolveAccount = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before validating your bank account.');
      return;
    }
    if (!accountNumber.trim() || !bankCode) {
      setActionError('Enter your account number and select your bank to continue.');
      return;
    }

    setResolveLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/identity/ng/resolve-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ account_number: accountNumber.trim(), bank_code: bankCode }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<AccountResolveResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not validate your bank account.'));
      }

      if (json?.data?.verified) {
        setActionNotice(json.data.message || 'Your bank account has been validated. Your subscription is now active.');
        await loadIdentityState(false);
        return;
      }

      setActionError(json?.data?.message || 'Could not validate your bank account. Please double-check the details and try again.');
    } catch (resolveError) {
      setActionError(resolveError instanceof Error ? resolveError.message : 'Could not validate your bank account.');
    } finally {
      setResolveLoading(false);
    }
  };

  const handleBypass = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before using the test-mode shortcut.');
      return;
    }

    setBypassLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/identity/bypass', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json().catch(() => null) as ApiResponse<{ identity_verified?: boolean }> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not skip identity verification.'));
      }

      setActionNotice(json?.message || 'Identity verification skipped in test mode.');
      await loadIdentityState(false);
    } catch (bypassError) {
      setActionError(bypassError instanceof Error ? bypassError.message : 'Could not skip identity verification.');
    } finally {
      setBypassLoading(false);
    }
  };

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  const isVerified = Boolean(status?.verified || profile?.identity_verified);
  const isPending = status?.status === 'pending' && !isVerified;
  const isFailed = status?.status === 'failed' && !isVerified;
  const verifiedDate = formatVerifiedDate(status?.verifiedAt || profile?.identity_verified_at || undefined);
  const isUkUser = profile?.country === 'GB';
  const verificationStatusLabel = isVerified
    ? 'Verified'
    : isPending
      ? 'Pending'
      : isFailed
        ? 'Needs another attempt'
        : 'Not started';

  return (
    <DashboardLayout>
      <Helmet>
        <title>Verify Identity — PadiHub</title>
        <meta name="description" content="Complete identity verification so you can create and join savings groups on PadiHub." />
        <link rel="canonical" href="https://padihub.com/verify-identity" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="mb-5">
          <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back to profile
          </Link>
        </div>

        <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {error ? (
            <div className="rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertTriangle size={24} style={{ color: '#EF4444' }} />
              </div>
              <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load identity verification</h1>
              <p className="text-sm text-gray-500 mb-5">{error}</p>
              <button
                onClick={() => void loadIdentityState()}
                className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
              >
                Try again
              </button>
            </div>
          ) : profile && status ? (
            <>
              <div className="mb-5">
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Verify your identity</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {isUkUser
                    ? 'Your card is saved but will not be charged until verification succeeds. Once verified, your subscription starts and you can create/join savings groups.'
                    : 'Your card is saved but your subscription will not be charged until your bank account details are validated. Once validated, your subscription starts and you can create/join savings groups.'}
                </p>
              </div>

              {(actionError || actionNotice) && (
                <div
                  className="rounded-2xl p-4 mb-5 flex items-start gap-3"
                  style={{
                    background: actionError ? 'rgba(239,68,68,0.08)' : 'rgba(46,175,111,0.08)',
                    border: actionError ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(46,175,111,0.2)',
                  }}
                >
                  {actionError ? <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0 }} /> : <CheckCircle size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />}
                  <p className="text-sm" style={{ color: actionError ? '#B91C1C' : '#166534' }}>{actionError || actionNotice}</p>
                </div>
              )}

              <div className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Verification method</p>
                    <p className="font-bold text-gray-900">{isUkUser ? 'Stripe Identity (UK)' : 'Bank account validation — Account Resolve (Nigeria)'}</p>
                  </div>
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full inline-flex items-center gap-1"
                    style={{
                      color: isVerified ? '#2EAF6F' : isFailed ? '#EF4444' : '#F59E0B',
                      background: isVerified ? 'rgba(46,175,111,0.12)' : isFailed ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                    }}
                  >
                    {isPending && <Clock size={12} />}
                    {verificationStatusLabel}
                  </span>
                </div>

                {!isUkUser && (
                  <div className="rounded-2xl p-3 mb-4 text-xs text-gray-600" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                    Account Resolve confirms your bank account number matches a real account holder&apos;s name — it is a preliminary bank-account check, not full identity/KYC verification. A fuller identity-verification step may be added later.
                  </div>
                )}

                {isVerified ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
                      <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">You&apos;re verified</p>
                        <p className="text-sm text-gray-700">
                          Verification is complete{verifiedDate ? ` as of ${verifiedDate}` : ''} and your subscription is active. You can continue using PadiHub.
                        </p>
                      </div>
                    </div>

                    <Link
                      to={returnPath}
                      className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                    >
                      {returnLabel}
                    </Link>
                  </div>
                ) : isUkUser ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl p-4 text-sm text-gray-700" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      A secure verification window will open right here on PadiHub and ask for an identity document and a matching selfie — you never leave the dashboard.
                    </div>

                    <button
                      onClick={() => void handleStartStripeVerification()}
                      disabled={startLoading || awaitingWebhook}
                      className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                    >
                      {awaitingWebhook ? 'Confirming result…' : startLoading ? 'Opening verification…' : isFailed || status.sessionId ? 'Try verification again' : 'Verify with Stripe Identity'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Bank</label>
                      <select
                        value={bankCode}
                        onChange={event => { setBankCode(event.target.value); setActionError(''); }}
                        disabled={banksLoading || Boolean(banksError)}
                        className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                        style={{ border: '1px solid #E5E7EB' }}
                      >
                        <option value="">
                          {banksLoading ? 'Loading banks…' : banksError ? 'Could not load banks' : 'Select your bank'}
                        </option>
                        {banks.map(bank => (
                          <option key={bank.code} value={bank.code}>{bank.name}</option>
                        ))}
                      </select>
                      {banksError && <p className="text-xs mt-1" style={{ color: '#EF4444' }}>{banksError}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Account number</label>
                      <input
                        value={accountNumber}
                        onChange={event => {
                          setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 10));
                          setActionError('');
                        }}
                        inputMode="numeric"
                        maxLength={10}
                        className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                        style={{ border: '1px solid #E5E7EB' }}
                        placeholder="Enter your account number"
                      />
                    </div>
                    <button
                      onClick={() => void handleResolveAccount()}
                      disabled={resolveLoading || !accountNumber.trim() || !bankCode}
                      className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                    >
                      {resolveLoading ? 'Validating…' : isFailed ? 'Try again' : 'Validate & Continue'}
                    </button>
                  </div>
                )}
              </div>

              {status.bypass_available && !isVerified && (
                <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                  <p className="font-bold text-gray-900 text-sm mb-1">Skip verification (test mode)</p>
                  <p className="text-xs text-gray-500 mb-4">Test mode only — not available in production.</p>
                  <button
                    onClick={() => void handleBypass()}
                    disabled={bypassLoading}
                    className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #6B7280, #4B5563)' }}
                  >
                    {bypassLoading ? 'Skipping verification…' : 'Skip verification (test mode)'}
                  </button>
                </div>
              )}
            </>
          ) : null}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
