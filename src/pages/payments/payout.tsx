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
  stripe_payment_method_id?: string | null;
  flutterwave_card_token?: string | null;
  payment_method_verified_at?: string | null;
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
  accountId?: string;
}

interface Bank {
  code: string;
  name: string;
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

/** Mirrors src/pages/verify-identity.tsx's getReturnPath/getReturnLabel — lets
 * a member who arrived here from an invite's onboarding checklist (join.tsx)
 * get back there once their payout destination is connected, including after
 * an external Stripe Connect hosted-onboarding round trip (see the `next`
 * param forwarded to /api/payments/connect-onboard below). */
function getReturnPath(searchParams: { get(name: string): string | null }) {
  const candidate = searchParams.get('redirect') || searchParams.get('next');
  if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//')) return null;
  return candidate;
}

function getReturnLabel(path: string) {
  if (path.includes('/join')) return 'Continue joining the group';
  if (path === '/savings-groups/create') return 'Continue creating your group';
  return 'Continue';
}

export default function ConnectPayoutPage() {
  const [searchParams] = useSearchParams();
  const returnPath = getReturnPath(searchParams);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [connectLoading, setConnectLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [changingPayoutDestination, setChangingPayoutDestination] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [banksError, setBanksError] = useState('');

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
  const hasSavedPaymentMethod = Boolean(
    profile && (profile.country === 'NG' ? profile.flutterwave_card_token : profile.stripe_payment_method_id)
      && profile.payment_method_verified_at,
  );
  const showPayoutForm = !hasConnectedDestination || changingPayoutDestination;

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
      setActionNotice(
        searchParams.get('payout_mode') === 'change'
          ? 'Your updated payout destination was received. Verifying now…'
          : 'Your payout account is connected. Verifying now…',
      );
      setActionError('');
      void handleVerify();
    } else if (searchParams.get('stripe_refresh') === '1') {
      setActionError(
        searchParams.get('payout_mode') === 'change'
          ? 'Your payout account change was not completed. Please try again.'
          : 'Payout onboarding was not completed. Please try connecting again.',
      );
    }
    // Only re-run when the URL search params change, not on every
    // handleVerify identity change (which updates once profile loads) — an
    // eslint-disable would otherwise be needed here, so we depend on the
    // param values directly instead of the whole searchParams object/handler.
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile?.country !== 'NG' || (!changingPayoutDestination && hasConnectedDestination)) return;

    const session = getValidSession();
    if (!session?.token) return;

    let cancelled = false;
    setBanksLoading(true);
    setBanksError('');

    (async () => {
      try {
        const response = await window.fetch('/api/payments/banks', {
          headers: { Authorization: 'Bearer ' + session.token },
        });
        const json = await response.json().catch(() => null) as ApiResponse<Bank[]> | null;
        if (!response.ok) {
          throw new Error(getErrorMessage(json, 'Could not load the list of banks.'));
        }
        if (!cancelled) setBanks(json?.data ?? []);
      } catch (banksFetchError) {
        if (!cancelled) {
          setBanksError(banksFetchError instanceof Error ? banksFetchError.message : 'Could not load the list of banks.');
        }
      } finally {
        if (!cancelled) setBanksLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profile?.country, hasConnectedDestination, changingPayoutDestination]);

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
      setActionError('Please provide your account name, bank, and account number.');
      return;
    }
    if (profile?.country !== 'NG' && (!businessName || !sortCode || !accountNumber)) {
      setActionError('Please provide your account holder name, sort code, and account number.');
      return;
    }

    setConnectLoading(true);
    setActionError('');
    setActionNotice('');
    const isUpdatingPayoutDestination = hasConnectedDestination && changingPayoutDestination;

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
            : {
              account_holder_name: businessName, sort_code: sortCode, account_number: accountNumber,
              ...(returnPath ? { next: returnPath } : {}),
            },
        ),
      });
      const json = await response.json().catch(() => null) as ApiResponse<ConnectOnboardResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not connect your payout destination.'));
      }

      const onboardingUrl = json?.data?.onboardingUrl;
      if (onboardingUrl) {
        window.location.assign(onboardingUrl);
        return;
      }

      setChangingPayoutDestination(false);
      setTermsAccepted(false);
      setActionNotice(
        isUpdatingPayoutDestination
          ? 'Payout destination updated. It is now in effect immediately for future payouts.'
          : 'Your payout account is connected. You can now receive payouts.',
      );
      await loadProfile();
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
        <title>Manage Payout Destination — PadiHub</title>
        <meta name="description" content="Add or change the payout destination used when it's your turn in the rotation." />
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
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Manage payout destination</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Every member of a rotating savings group eventually receives a payout. Connect where that money should go.
                </p>
              </div>

              {returnPath && (
                <Link
                  to={returnPath}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white mb-5"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                >
                  {getReturnLabel(returnPath)}
                </Link>
              )}

              <div className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <h2 className="font-bold text-gray-900 mb-3">Payment setup overview</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Link to={returnPath ? `/payments/methods?next=${encodeURIComponent(returnPath)}` : '/payments/methods'} className="rounded-2xl p-4 transition-all hover:opacity-90" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                    <p className="text-xs text-gray-500 mb-1">Contribution charges</p>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-gray-900">Payment method</p>
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{
                          color: hasSavedPaymentMethod ? '#2EAF6F' : '#F59E0B',
                          background: hasSavedPaymentMethod ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                        }}
                      >
                        {hasSavedPaymentMethod ? 'Verified' : 'Needed'}
                      </span>
                    </div>
                  </Link>
                  <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                    <p className="text-xs text-gray-500 mb-1">Where you receive money</p>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-gray-900">Payout destination</p>
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full text-center"
                        style={{
                          color: isPayoutVerified ? '#2EAF6F' : '#F59E0B',
                          background: isPayoutVerified ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                        }}
                      >
                        {isPayoutVerified ? 'Verified' : hasConnectedDestination ? 'Connected' : 'Needed'}
                      </span>
                    </div>
                  </div>
                </div>
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

                {isPayoutVerified && !changingPayoutDestination && (
                  <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
                    <div className="flex items-start gap-3">
                      <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <p className="text-sm text-gray-700">
                        Your payout destination is verified. When it&apos;s your turn in the rotation, your payout will be sent here. Your very first payout may take up to 7–14 days while our payment processor completes a standard review for new payout destinations; payouts after that typically arrive within about 3 business days.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setChangingPayoutDestination(true);
                        setTermsAccepted(false);
                        setActionError('');
                        setActionNotice('');
                      }}
                      className="mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                      type="button"
                    >
                      <Banknote size={16} />
                      Change payout account
                    </button>
                  </div>
                )}

                {!isPayoutVerified && hasConnectedDestination && !changingPayoutDestination ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <AlertTriangle size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
                      <p className="text-sm text-gray-700">
                        A payout destination is on file but hasn&apos;t been verified yet
                        {profile?.country === 'NG' ? '.' : ' — verification may still be in progress.'}
                        {' '}You need a verified payout destination before you can join a group.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        onClick={() => void handleVerify()}
                        disabled={verifyLoading}
                        className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                        type="button"
                      >
                        {verifyLoading ? 'Verifying…' : 'Verify now'}
                      </button>
                      <button
                        onClick={() => {
                          setChangingPayoutDestination(true);
                          setTermsAccepted(false);
                          setActionError('');
                          setActionNotice('');
                        }}
                        className="w-full py-3 rounded-2xl font-bold text-gray-700 transition-all"
                        style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                        type="button"
                      >
                        Change payout account
                      </button>
                    </div>
                  </div>
                ) : null}

                {showPayoutForm && (
                  <div className="space-y-4">
                    {changingPayoutDestination && (
                      <div className="flex items-center justify-between gap-3 rounded-2xl p-3" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                        <p className="text-sm text-gray-600">Enter your new payout details to replace the destination currently on file.</p>
                        <button
                          onClick={() => {
                            setChangingPayoutDestination(false);
                            setTermsAccepted(false);
                            setActionError('');
                          }}
                          className="text-sm font-semibold text-gray-500 hover:text-gray-800"
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
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
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Bank name</label>
                          <select
                            value={bankCode}
                            onChange={e => setBankCode(e.target.value)}
                            disabled={banksLoading || Boolean(banksError)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm bg-white disabled:opacity-60"
                            style={{ border: '1px solid #E5E7EB' }}
                          >
                            <option value="">
                              {banksLoading ? 'Loading banks…' : banksError ? 'Could not load banks' : 'Select your bank'}
                            </option>
                            {banks.map(bank => (
                              <option key={bank.code} value={bank.code}>{bank.name}</option>
                            ))}
                          </select>
                          {banksError && (
                            <p className="text-xs mt-1" style={{ color: '#EF4444' }}>{banksError}</p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Bank account number</label>
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
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Account holder name</label>
                          <input
                            value={businessName}
                            onChange={e => setBusinessName(e.target.value)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="Name on your bank account"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Sort code</label>
                          <input
                            value={sortCode}
                            onChange={e => setSortCode(e.target.value)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="e.g. 12-34-56"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">Account number</label>
                          <input
                            value={accountNumber}
                            onChange={e => setAccountNumber(e.target.value)}
                            className="w-full rounded-xl px-3.5 py-2.5 text-sm"
                            style={{ border: '1px solid #E5E7EB' }}
                            placeholder="8-digit account number"
                          />
                        </div>
                        <div className="rounded-2xl p-3 bg-white text-sm text-gray-600" style={{ border: '1px solid #E5E7EB' }}>
                          If Stripe needs anything else to verify your identity, we&apos;ll take you to a secure Stripe page for just that step.
                        </div>
                        <button
                          onClick={() => void handleConnect()}
                          disabled={connectLoading || !termsAccepted}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                        >
                          <Banknote size={16} />
                          {connectLoading ? 'Connecting…' : 'Connect payout account'}
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
                  <p className="text-xs text-gray-500 mt-0.5">
                    {hasSavedPaymentMethod
                      ? 'Verified and ready for recurring contribution charges.'
                      : 'Save a card to authorize your recurring group contributions.'}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{
                      color: hasSavedPaymentMethod ? '#2EAF6F' : '#F59E0B',
                      background: hasSavedPaymentMethod ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                    }}
                  >
                    {hasSavedPaymentMethod ? 'Verified' : 'Needed'}
                  </span>
                  <ChevronLeft size={16} className="rotate-180 text-gray-400" />
                </div>
              </Link>
            </>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
