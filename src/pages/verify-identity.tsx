import { useCallback, useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ExternalLink,
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

interface IdentityStatus {
  verified: boolean;
  verifiedAt?: string;
  sessionId?: string;
  bypass_available: boolean;
}

interface StripeVerificationStartResponse {
  url?: string;
}

interface BvnVerificationStartResponse {
  message?: string;
}

interface BvnVerificationConfirmResponse {
  verified?: boolean;
  message?: string;
}

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

export default function VerifyIdentityPage() {
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [bvn, setBvn] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [startLoading, setStartLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [bypassLoading, setBypassLoading] = useState(false);

  const returnPath = getReturnPath(searchParams);
  const returnLabel = getReturnLabel(returnPath);

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
    } catch (loadError) {
      setStatus(null);
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load your identity verification status.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadIdentityState();
  }, [loadIdentityState]);

  const handleStartStripeVerification = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before starting identity verification.');
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

      const url = json?.data?.url;
      if (!url) {
        throw new Error('The verification service did not return a hosted verification link.');
      }

      window.location.href = url;
    } catch (startError) {
      setActionError(startError instanceof Error ? startError.message : 'Could not start Stripe Identity verification.');
      setStartLoading(false);
    }
  };

  const handleStartBvnVerification = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before starting BVN verification.');
      return;
    }

    if (!/^\d{11}$/.test(bvn)) {
      setActionError('Enter your 11-digit BVN to continue.');
      return;
    }

    setStartLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/identity/bvn/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ bvn }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<BvnVerificationStartResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not start BVN verification.'));
      }

      setOtpRequested(true);
      setOtp('');
      setActionNotice(json?.data?.message || 'OTP sent to your BVN-registered phone number.');
    } catch (startError) {
      setActionError(startError instanceof Error ? startError.message : 'Could not start BVN verification.');
    } finally {
      setStartLoading(false);
    }
  };

  const handleConfirmBvnVerification = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before confirming your OTP.');
      return;
    }

    if (!otp.trim()) {
      setActionError('Enter the OTP sent to your phone.');
      return;
    }

    setConfirmLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/identity/bvn/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ otp: otp.trim() }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<BvnVerificationConfirmResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not confirm your OTP.'));
      }

      if (json?.data?.verified) {
        setActionNotice(json.data.message || 'Your identity has been verified.');
        setOtpRequested(false);
        await loadIdentityState(false);
        return;
      }

      setActionError(json?.data?.message || 'OTP verification failed. Please try again.');
    } catch (confirmError) {
      setActionError(confirmError instanceof Error ? confirmError.message : 'Could not confirm your OTP.');
    } finally {
      setConfirmLoading(false);
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
      setOtpRequested(false);
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
  const verifiedDate = formatVerifiedDate(status?.verifiedAt || profile?.identity_verified_at || undefined);
  const isUkUser = profile?.country === 'GB';
  const verificationStatusLabel = isVerified
    ? 'Verified'
    : isUkUser && status?.sessionId
      ? 'Started — not verified yet'
      : otpRequested
        ? 'OTP sent'
        : 'Not verified yet';

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
                  Complete identity verification to unlock savings-group creation and joining.
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
                    <p className="text-xs text-gray-500 mb-1">Verification provider</p>
                    <p className="font-bold text-gray-900">{isUkUser ? 'Stripe Identity (UK)' : 'BVN verification (Nigeria)'}</p>
                  </div>
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{
                      color: isVerified ? '#2EAF6F' : '#F59E0B',
                      background: isVerified ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                    }}
                  >
                    {verificationStatusLabel}
                  </span>
                </div>

                {isVerified ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
                      <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <div>
                        <p className="text-sm font-semibold text-gray-900">You&apos;re verified</p>
                        <p className="text-sm text-gray-700">
                          Your identity verification is complete{verifiedDate ? ` as of ${verifiedDate}` : ''}. You can continue using PadiHub.
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
                      Stripe&apos;s secure hosted flow will ask for an identity document and a matching selfie. It opens in a new page and returns you to PadiHub when you&apos;re done.
                    </div>

                    <button
                      onClick={() => void handleStartStripeVerification()}
                      disabled={startLoading}
                      className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                    >
                      {startLoading ? 'Opening Stripe Identity…' : status.sessionId ? 'Continue with Stripe Identity' : 'Verify with Stripe Identity'}
                      {!startLoading && <ExternalLink size={16} />}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">BVN</label>
                      <input
                        value={bvn}
                        onChange={event => {
                          setBvn(event.target.value.replace(/\D/g, '').slice(0, 11));
                          setActionError('');
                        }}
                        inputMode="numeric"
                        maxLength={11}
                        className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                        style={{ border: '1px solid #E5E7EB' }}
                        placeholder="Enter your 11-digit BVN"
                      />
                    </div>

                    {!otpRequested ? (
                      <button
                        onClick={() => void handleStartBvnVerification()}
                        disabled={startLoading || bvn.length !== 11}
                        className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                      >
                        {startLoading ? 'Sending OTP…' : 'Send OTP'}
                      </button>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-2xl p-3 text-sm text-gray-700" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                          Enter the OTP sent to the phone number linked to your BVN.
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">OTP</label>
                          <input
                            value={otp}
                            onChange={event => {
                              setOtp(event.target.value.replace(/\D/g, ''));
                              setActionError('');
                            }}
                            inputMode="numeric"
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="Enter OTP"
                          />
                        </div>
                        <button
                          onClick={() => void handleConfirmBvnVerification()}
                          disabled={confirmLoading || !otp.trim()}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                        >
                          {confirmLoading ? 'Verifying OTP…' : 'Confirm OTP'}
                        </button>
                      </div>
                    )}
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
