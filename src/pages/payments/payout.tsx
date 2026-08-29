import { useCallback, useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  CheckCircle,
  ChevronLeft,
  ExternalLink,
  Shield,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { getValidSession } from '@/lib/session';

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  stripe_connected_account_id?: string | null;
  flutterwave_subaccount_id?: string | null;
  payout_verified_at?: string | null;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, string[] | undefined>;
}

interface ConnectOnboardResponse {
  onboardingUrl?: string;
  subaccountId?: string;
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

export default function ConnectPayoutPage() {
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const loadProfile = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to connect a payout destination.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await window.fetch('/api/users/profile', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not load your profile.'));
      }
      setProfile(json?.data ?? null);
    } catch (loadError) {
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load your profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const hasConnectedDestination = Boolean(
    profile && (profile.country === 'NG' ? profile.flutterwave_subaccount_id : profile.stripe_connected_account_id),
  );
  const isPayoutVerified = Boolean(profile?.payout_verified_at);

  const handleVerify = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) return;

    setVerifyLoading(true);
    try {
      const response = await window.fetch('/api/payments/verify-payout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json().catch(() => null) as ApiResponse<{ payout_verified: boolean }> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not verify your payout destination.'));
      }
      await loadProfile();
      if (json?.data?.payout_verified) {
        setActionNotice('Your payout destination is verified. You can now receive payouts.');
        setActionError('');
      } else {
        setActionNotice('');
        setActionError(
          profile?.country === 'NG'
            ? 'Your payout account has not been verified yet. Please check your account details and try again.'
            : 'Your payout account is still being verified — this can take a few minutes after onboarding. Try verifying again shortly.',
        );
      }
    } catch (verifyError) {
      setActionError(verifyError instanceof Error ? verifyError.message : 'Could not verify your payout destination.');
    } finally {
      setVerifyLoading(false);
    }
  }, [loadProfile, profile?.country]);

  useEffect(() => {
    if (searchParams.get('stripe_connected') === '1') {
      setActionNotice('Your payout account is connected. Verifying now…');
      setActionError('');
      void handleVerify();
    } else if (searchParams.get('stripe_refresh') === '1') {
      setActionError('Payout onboarding was not completed. Please try connecting again.');
    }
    // Only re-run when the URL search params change, not on every
    // handleVerify identity change (which updates once profile loads) — an
    // eslint-disable would otherwise be needed here, so we depend on the
    // param values directly instead of the whole searchParams object/handler.
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (!termsAccepted) {
      setActionError('Please accept the terms & conditions before connecting a payout destination.');
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before connecting your payout destination.');
      return;
    }

    if (profile?.country === 'NG' && (!businessName || !bankCode || !accountNumber)) {
      setActionError('Please provide your business name, bank code, and account number.');
      return;
    }

    setConnectLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/payments/connect-onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify(
          profile?.country === 'NG'
            ? { business_name: businessName, bank_code: bankCode, account_number: accountNumber }
            : {},
        ),
      });
      const json = await response.json().catch(() => null) as ApiResponse<ConnectOnboardResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not connect your payout destination.'));
      }

      if (profile?.country === 'NG') {
        setActionNotice('Your payout account is connected. You can now receive payouts.');
        await loadProfile();
        return;
      }

      const onboardingUrl = json?.data?.onboardingUrl;
      if (!onboardingUrl) {
        throw new Error('The payout service did not return an onboarding link.');
      }
      window.location.assign(onboardingUrl);
    } catch (connectError) {
      setActionError(connectError instanceof Error ? connectError.message : 'Could not connect your payout destination.');
    } finally {
      setConnectLoading(false);
    }
  };

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Connect Payout Destination — PadiHub</title>
        <meta name="description" content="Connect a payout destination so you can receive money when it's your turn in the rotation." />
        <link rel="canonical" href="https://padihub.com/payments/payout" />
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
              <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load your profile</h1>
              <p className="text-sm text-gray-500 mb-5">{error}</p>
              <button
                onClick={() => void loadProfile()}
                className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5">
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Connect payout destination</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Every member of a rotating savings group eventually receives a payout. Connect where that money should go.
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
                    <p className="text-xs text-gray-500 mb-1">Payout provider</p>
                    <p className="font-bold text-gray-900">{profile?.country === 'NG' ? 'Payout account (Nigeria)' : 'Payout account (UK)'}</p>
                  </div>
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{
                      color: isPayoutVerified ? '#2EAF6F' : '#F59E0B',
                      background: isPayoutVerified ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                    }}
                  >
                    {isPayoutVerified ? 'Verified' : hasConnectedDestination ? 'Connected — not verified yet' : 'Not connected yet'}
                  </span>
                </div>

                {isPayoutVerified ? (
                  <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
                    <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                    <p className="text-sm text-gray-700">
                      Your payout destination is verified. When it&apos;s your turn in the rotation, your payout will be sent here.
                    </p>
                  </div>
                ) : hasConnectedDestination ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
                      <p className="text-sm text-gray-700">
                        A payout destination is on file but hasn&apos;t been verified yet
                        {profile?.country === 'NG' ? '.' : ' — verification may still be in progress.'}
                        {' '}You need a verified payout destination before you can join a group.
                      </p>
                    </div>
                    <button
                      onClick={() => void handleVerify()}
                      disabled={verifyLoading}
                      className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                    >
                      {verifyLoading ? 'Verifying…' : 'Verify now'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 rounded-2xl p-4 cursor-pointer" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <Checkbox checked={termsAccepted} onCheckedChange={value => setTermsAccepted(value === true)} className="mt-0.5" />
                      <span className="text-sm text-gray-700">
                        I confirm the payout details I provide are mine and I authorize PadiHub to send my group payouts to this
                        destination, in line with the{' '}
                        <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline">
                          Terms &amp; Conditions
                        </Link>{' '}
                        and{' '}
                        <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline">
                          Privacy Policy
                        </Link>.
                      </span>
                    </label>

                    {profile?.country === 'NG' ? (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Business / account name</label>
                          <input
                            value={businessName}
                            onChange={e => setBusinessName(e.target.value)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="e.g. Chidinma Okafor"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Bank code</label>
                          <input
                            value={bankCode}
                            onChange={e => setBankCode(e.target.value)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="e.g. 044"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Account number</label>
                          <input
                            value={accountNumber}
                            onChange={e => setAccountNumber(e.target.value)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="10-digit NUBAN account number"
                          />
                        </div>
                        <button
                          onClick={() => void handleConnect()}
                          disabled={connectLoading || !termsAccepted}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                        >
                          <Banknote size={16} />
                          {connectLoading ? 'Connecting…' : 'Connect payout account'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-2xl p-3 bg-white text-sm text-gray-600" style={{ border: '1px solid #E5E7EB' }}>
                          A secure onboarding flow will verify your identity and bank details for payouts.
                        </div>
                        <button
                          onClick={() => void handleConnect()}
                          disabled={connectLoading || !termsAccepted}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                        >
                          {connectLoading ? 'Opening onboarding…' : 'Connect payout account'}
                          {!connectLoading && <ExternalLink size={16} />}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Link
                to="/payments/methods"
                className="flex items-center justify-between rounded-2xl p-4 bg-white transition-all hover:opacity-90"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div>
                  <p className="font-bold text-gray-900 text-sm">Add payment method</p>
                  <p className="text-xs text-gray-500 mt-0.5">Save a card to authorize your recurring group contributions.</p>
                </div>
                <ChevronLeft size={16} className="rotate-180 text-gray-400" />
              </Link>
            </>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
