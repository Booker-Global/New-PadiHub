import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  Clock,
  CreditCard,
  ExternalLink,
  PiggyBank,
  RefreshCw,
  Shield,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

interface SavingsGroup {
  id: string;
  name: string;
  description?: string | null;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'weekly' | 'monthly';
  payment_provider: 'stripe' | 'flutterwave';
  status: 'active' | 'closed' | 'suspended';
}

interface Contribution {
  id: string;
  group_id: string;
  member_id: string;
  cycle_number: number;
  amount_due: string | number;
  amount_paid?: string | number | null;
  due_date: string;
  paid_date?: string | null;
  payment_status: 'scheduled' | 'due' | 'paid' | 'failed' | 'missed';
  provider_reference?: string | null;
}

interface UserProfile {
  id: string;
  first_name: string;
  last_name: string;
  country: 'GB' | 'NG';
  stripe_payment_method_id?: string | null;
  flutterwave_card_token?: string | null;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, string[] | undefined>;
}

interface StripeSetupIntentResponse {
  clientSecret?: string;
}

interface FlutterwavePaymentLinkResponse {
  link: string;
  verification_amount: number;
  currency: string;
}

interface ChargeResult {
  providerReference: string;
  status: 'succeeded' | 'pending' | 'failed';
}

const STRIPE_PUBLISHABLE_KEY = (
  import.meta.env as Record<string, string | undefined>
).VITE_STRIPE_PUBLISHABLE_KEY?.trim() || '';

const actionableStatusRank: Record<Contribution['payment_status'], number> = {
  due: 0,
  failed: 1,
  missed: 2,
  scheduled: 3,
  paid: 4,
};

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

function formatCurrency(amount: string | number, currency: 'GBP' | 'NGN') {
  const numericAmount = typeof amount === 'number' ? amount : Number.parseFloat(amount);
  const locale = currency === 'GBP' ? 'en-GB' : 'en-NG';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
}

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getContributionStatusCopy(status: Contribution['payment_status']) {
  switch (status) {
    case 'due':
      return { label: 'Due now', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
    case 'failed':
      return { label: 'Retry payment', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
    case 'missed':
      return { label: 'Missed payment', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' };
    case 'scheduled':
      return { label: 'Scheduled', color: '#2eafaf', bg: 'rgba(46,175,175,0.12)' };
    default:
      return { label: 'Paid', color: '#2EAF6F', bg: 'rgba(46,175,111,0.12)' };
  }
}

export default function ContributionConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [group, setGroup] = useState<SavingsGroup | null>(null);
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [chargeLoading, setChargeLoading] = useState(false);
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);

  const loadData = useCallback(async () => {
    if (!id) {
      setError('Savings group not found.');
      setLoading(false);
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to manage contributions.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const [groupResponse, contributionsResponse, profileResponse] = await Promise.all([
        window.fetch(`/api/groups/${id}`, { headers }),
        window.fetch('/api/contributions', { headers }),
        window.fetch('/api/users/profile', { headers }),
      ]);

      const groupJson = await groupResponse.json().catch(() => null) as ApiResponse<SavingsGroup> | null;
      if (!groupResponse.ok) {
        throw new Error(getErrorMessage(groupJson, 'Could not load this savings group.'));
      }

      const contributionsJson = await contributionsResponse.json().catch(() => null) as ApiResponse<Contribution[]> | null;
      if (!contributionsResponse.ok) {
        throw new Error(getErrorMessage(contributionsJson, 'Could not load your contributions.'));
      }

      const profileJson = await profileResponse.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!profileResponse.ok) {
        throw new Error(getErrorMessage(profileJson, 'Could not load your profile.'));
      }

      const contributionRows = Array.isArray(contributionsJson?.data) ? contributionsJson.data : [];
      const nextContribution = contributionRows
        .filter(row => row.group_id === id && row.payment_status !== 'paid')
        .sort((left, right) => {
          const rankDiff = actionableStatusRank[left.payment_status] - actionableStatusRank[right.payment_status];
          if (rankDiff !== 0) return rankDiff;
          return new Date(left.due_date).getTime() - new Date(right.due_date).getTime();
        })[0] ?? null;

      setGroup(groupJson?.data ?? null);
      setContribution(nextContribution);
      setProfile(profileJson?.data ?? null);
    } catch (loadError) {
      setGroup(null);
      setContribution(null);
      setProfile(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load your contribution details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (searchParams.get('setup_saved') === '1') {
      setActionNotice('Payment method saved. You can now confirm this contribution.');
      setActionError('');
    }
  }, [searchParams]);

  const hasSavedPaymentMethod = useMemo(() => {
    if (!group || !profile) return false;
    return group.payment_provider === 'flutterwave'
      ? Boolean(profile.flutterwave_card_token)
      : Boolean(profile.stripe_payment_method_id);
  }, [group, profile]);

  const needsStripePaymentMethod = Boolean(
    group &&
    profile &&
    contribution &&
    group.payment_provider === 'stripe' &&
    !hasSavedPaymentMethod,
  );

  useEffect(() => {
    if (!needsStripePaymentMethod || !cardMountRef.current) return;
    if (!STRIPE_PUBLISHABLE_KEY) {
      setActionError('Stripe is not configured for this environment. Add VITE_STRIPE_PUBLISHABLE_KEY and try again.');
      return;
    }

    let isMounted = true;
    let mountedCard: StripeCardElement | null = null;

    const mountCard = async () => {
      try {
        const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
        if (!stripe || !cardMountRef.current || !isMounted) {
          if (!stripe && isMounted) {
            setActionError('Stripe could not be loaded. Please refresh and try again.');
          }
          return;
        }

        stripeRef.current = stripe;
        const elements = stripe.elements();
        mountedCard = elements.create('card', {
          hidePostalCode: true,
          style: {
            base: {
              color: '#111827',
              fontSize: '16px',
              fontFamily: 'Inter, system-ui, sans-serif',
              '::placeholder': { color: '#9CA3AF' },
            },
            invalid: { color: '#EF4444' },
          },
        });
        mountedCard.mount(cardMountRef.current);
        cardElementRef.current = mountedCard;
      } catch (mountError) {
        if (!isMounted) return;
        setActionError(mountError instanceof Error ? mountError.message : 'Could not load Stripe card entry.');
      }
    };

    void mountCard();

    return () => {
      isMounted = false;
      mountedCard?.destroy();
      cardElementRef.current = null;
      stripeRef.current = null;
    };
  }, [needsStripePaymentMethod]);

  useEffect(() => {
    const setupProvider = searchParams.get('setup_provider');
    const transactionId = searchParams.get('transaction_id');
    const txRef = searchParams.get('tx_ref') ?? undefined;
    const checkoutStatus = searchParams.get('status');

    if (setupProvider !== 'flutterwave') {
      return;
    }

    if (!transactionId || !txRef) {
      if (checkoutStatus && checkoutStatus !== 'successful') {
        setActionError('Flutterwave checkout did not complete. Try again to save your card.');
      } else {
        setActionError('Flutterwave did not return the transaction details needed to save your card. Please try again.');
      }
      return;
    }

    let cancelled = false;

    const saveToken = async () => {
      const session = getValidSession();
      if (!session?.token || !id) {
        setActionError('Please log in again before saving your payment method.');
        return;
      }

      setSetupLoading(true);
      setActionError('');
      setActionNotice('Verifying your Flutterwave payment method…');

      try {
        const response = await window.fetch('/api/payments/save-flutterwave-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + session.token,
          },
          body: JSON.stringify({ transaction_id: transactionId, tx_ref: txRef }),
        });
        const json = await response.json().catch(() => null) as ApiResponse<null> | null;
        if (!response.ok) {
          throw new Error(getErrorMessage(json, 'Could not save your Flutterwave card token.'));
        }

        if (cancelled) return;
        await loadData();
        navigate(`/savings-groups/${id}/contribute?setup_saved=1`, { replace: true });
      } catch (saveError) {
        if (cancelled) return;
        setActionNotice('');
        setActionError(saveError instanceof Error ? saveError.message : 'Could not save your Flutterwave card token.');
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    };

    void saveToken();

    return () => {
      cancelled = true;
    };
  }, [id, loadData, navigate, searchParams]);

  const statusMeta = contribution ? getContributionStatusCopy(contribution.payment_status) : null;

  const handleStripeSetup = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before saving your payment method.');
      return;
    }

    const stripe = stripeRef.current;
    const cardElement = cardElementRef.current;
    if (!stripe || !cardElement) {
      setActionError('The Stripe card form is still loading. Please wait a moment and try again.');
      return;
    }

    setSetupLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const setupResponse = await window.fetch('/api/payments/setup-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
      });
      const setupJson = await setupResponse.json().catch(() => null) as ApiResponse<StripeSetupIntentResponse> | null;
      if (!setupResponse.ok) {
        throw new Error(getErrorMessage(setupJson, 'Could not start Stripe payment method setup.'));
      }

      const clientSecret = setupJson?.data?.clientSecret;
      if (!clientSecret) {
        throw new Error('Stripe did not return a setup client secret.');
      }

      const confirmation = await stripe.confirmCardSetup(clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: profile ? `${profile.first_name} ${profile.last_name}` : undefined,
          },
        },
      });

      if (confirmation.error) {
        throw new Error(confirmation.error.message || 'Stripe could not save your card.');
      }

      const paymentMethod = confirmation.setupIntent?.payment_method;
      const paymentMethodId = typeof paymentMethod === 'string' ? paymentMethod : paymentMethod?.id;
      if (!paymentMethodId) {
        throw new Error('Stripe did not return a payment method ID.');
      }

      const saveResponse = await window.fetch('/api/payments/confirm-setup-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ payment_method_id: paymentMethodId }),
      });
      const saveJson = await saveResponse.json().catch(() => null) as ApiResponse<null> | null;
      if (!saveResponse.ok) {
        throw new Error(getErrorMessage(saveJson, 'Could not save your Stripe payment method.'));
      }

      setActionNotice('Payment method saved. You can now confirm this contribution.');
      await loadData();
    } catch (setupError) {
      setActionError(setupError instanceof Error ? setupError.message : 'Could not save your payment method.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleFlutterwaveSetup = async () => {
    if (!contribution) return;

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before saving your payment method.');
      return;
    }

    setSetupLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/payments/create-flutterwave-payment-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ contribution_id: contribution.id }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<FlutterwavePaymentLinkResponse> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not start Flutterwave checkout.'));
      }

      const link = json?.data?.link;
      if (!link) {
        throw new Error('Flutterwave did not return a checkout link.');
      }

      window.location.assign(link);
    } catch (setupError) {
      setActionError(setupError instanceof Error ? setupError.message : 'Could not start Flutterwave checkout.');
      setSetupLoading(false);
    }
  };

  const handleConfirmContribution = async () => {
    if (!contribution || !group) return;

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before charging your contribution.');
      return;
    }

    setChargeLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/payments/charge-contribution', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ contribution_id: contribution.id }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<ChargeResult> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not charge this contribution.'));
      }

      const chargeStatus = json?.data?.status;
      if (!chargeStatus || chargeStatus === 'failed') {
        throw new Error('The payment provider did not confirm this contribution charge. Please try again.');
      }

      navigate(
        `/savings-groups/contribution-success?contribution_id=${contribution.id}&group_id=${group.id}&status=${chargeStatus}`,
      );
    } catch (chargeError) {
      setActionError(chargeError instanceof Error ? chargeError.message : 'Could not charge this contribution.');
    } finally {
      setChargeLoading(false);
    }
  };

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  const groupId = group?.id ?? id ?? '';

  return (
    <DashboardLayout>
      <Helmet>
        <title>Contribute — {group?.name ?? 'Savings group'} — PadiHub</title>
        <meta name="description" content="Confirm a real contribution payment on PadiHub." />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${groupId}/contribute`} />
        <meta property="og:title" content={`Contribute — ${group?.name ?? 'Savings group'} — PadiHub`} />
        <meta property="og:description" content="Confirm a real contribution payment on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://padihub.com/savings-groups/${groupId}/contribute`} />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <div className="mb-5">
          <Link to={groupId ? `/savings-groups/${groupId}` : '/savings-groups'} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
        </div>

        <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {error ? (
            <div className="rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertTriangle size={24} style={{ color: '#EF4444' }} />
              </div>
              <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load this contribution</h1>
              <p className="text-sm text-gray-500 mb-5">{error}</p>
              <button
                onClick={() => void loadData()}
                className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
              >
                Try again
              </button>
            </div>
          ) : !group ? (
            <div className="rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
              <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Savings group not found</h1>
              <p className="text-sm text-gray-500">We couldn&apos;t find this savings group.</p>
            </div>
          ) : !contribution ? (
            <div className="rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(46,175,175,0.1)' }}>
                <Clock size={24} style={{ color: '#2eafaf' }} />
              </div>
              <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No contribution is due right now</h1>
              <p className="text-sm text-gray-500 mb-5">There is no unpaid scheduled contribution for this group on your account yet.</p>
              <Link
                to={`/savings-groups/${group.id}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
              >
                Back to group
              </Link>
            </div>
          ) : (
            <>
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

              <div className="rounded-3xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: group.payment_provider === 'flutterwave' ? '#2EAF6F' : '#2eafaf' }} />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${group.payment_provider === 'flutterwave' ? '#2EAF6F' : '#2eafaf'}, rgba(255,255,255,0.2))` }}>
                      <PiggyBank size={18} color="#fff" />
                    </div>
                    <div>
                      <p className="font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {titleCase(group.contribution_frequency)} contribution · {group.payment_provider === 'flutterwave' ? 'Flutterwave' : 'Stripe'}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <p className="text-lg font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{formatCurrency(contribution.amount_due, group.currency)}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Amount due</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <p className="text-lg font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>Cycle {contribution.cycle_number}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Contribution cycle</p>
                    </div>
                    <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <p className="text-lg font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{formatDate(contribution.due_date)}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Due date</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Confirm contribution</h1>
                    <p className="text-sm text-gray-500 mt-1">Use your saved payment method to pay this contribution.</p>
                  </div>
                  {statusMeta && (
                    <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ color: statusMeta.color, background: statusMeta.bg }}>
                      {statusMeta.label}
                    </span>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                    <p className="text-xs text-gray-500 mb-1">Payment provider</p>
                    <p className="font-bold text-gray-900">{group.payment_provider === 'flutterwave' ? 'Flutterwave (NG)' : 'Stripe (GB)'}</p>
                  </div>
                  <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                    <p className="text-xs text-gray-500 mb-1">Saved payment method</p>
                    <p className="font-bold text-gray-900">{hasSavedPaymentMethod ? 'Ready to use' : 'Not saved yet'}</p>
                  </div>
                </div>

                {!hasSavedPaymentMethod ? (
                  <div className="rounded-2xl p-4" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                    <div className="flex items-start gap-3 mb-4">
                      <CreditCard size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
                      <div>
                        <p className="font-bold text-gray-900">Add a payment method first</p>
                        <p className="text-sm text-gray-600 mt-1">
                          {group.payment_provider === 'flutterwave'
                            ? 'We need a verified Flutterwave card token before we can charge this contribution.'
                            : 'Save a card with Stripe before we can charge this contribution.'}
                        </p>
                      </div>
                    </div>

                    {group.payment_provider === 'stripe' ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid #E5E7EB' }}>
                          <div ref={cardMountRef} />
                        </div>
                        <button
                          onClick={() => void handleStripeSetup()}
                          disabled={setupLoading || !STRIPE_PUBLISHABLE_KEY}
                          className="w-full py-3 rounded-2xl font-bold text-white transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                        >
                          {setupLoading ? 'Saving card…' : 'Save card with Stripe'}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-2xl p-3 bg-white text-sm text-gray-600" style={{ border: '1px solid #E5E7EB' }}>
                          Flutterwave will open a secure hosted checkout to verify and tokenise your card for future contribution charges.
                        </div>
                        <button
                          onClick={() => void handleFlutterwaveSetup()}
                          disabled={setupLoading}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                        >
                          {setupLoading ? 'Opening checkout…' : 'Continue to secure checkout'}
                          {!setupLoading && <ExternalLink size={16} />}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl p-3 mb-4 flex items-start gap-3" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
                      <Shield size={16} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                      <p className="text-sm text-gray-700">
                        {group.payment_provider === 'flutterwave'
                          ? 'Your Flutterwave card token is saved and ready for this contribution charge.'
                          : 'Your Stripe payment method is saved and ready for this contribution charge.'}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleConfirmContribution()}
                      disabled={chargeLoading || setupLoading}
                      className="w-full py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ background: `linear-gradient(135deg, ${group.payment_provider === 'flutterwave' ? '#2EAF6F' : '#2eafaf'}, rgba(17,24,39,0.9))` }}
                    >
                      {(chargeLoading || setupLoading) && <RefreshCw size={16} className="animate-spin" />}
                      <ArrowRight size={16} />
                      {chargeLoading ? 'Charging contribution…' : 'Confirm contribution'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
