import { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { loadStripe, type Stripe, type StripeCardElement } from '@stripe/stripe-js';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  CheckCircle,
  CreditCard,
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

export default function AddPaymentMethodPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const cardMountRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const cardElementRef = useRef<StripeCardElement | null>(null);

  const loadProfile = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to add a payment method.');
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

  useEffect(() => {
    if (searchParams.get('setup_saved') === '1') {
      setActionNotice('Payment method saved. Your recurring contributions can now be charged automatically.');
      setActionError('');
    }
  }, [searchParams]);

  const hasSavedPaymentMethod = Boolean(
    profile && (profile.country === 'NG' ? profile.flutterwave_card_token : profile.stripe_payment_method_id)
      && profile.payment_method_verified_at,
  );

  const needsStripeCard = Boolean(profile && profile.country !== 'NG' && !hasSavedPaymentMethod);

  useEffect(() => {
    if (!needsStripeCard || !cardMountRef.current) return;
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
  }, [needsStripeCard]);

  // Handle the redirect back from Flutterwave's hosted checkout.
  useEffect(() => {
    const setupProvider = searchParams.get('setup_provider');
    const transactionId = searchParams.get('transaction_id');
    const txRef = searchParams.get('tx_ref') ?? undefined;
    const checkoutStatus = searchParams.get('status');

    if (setupProvider !== 'flutterwave') return;

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
      if (!session?.token) {
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
        await loadProfile();
        navigate('/payments/methods?setup_saved=1', { replace: true });
      } catch (saveError) {
        if (cancelled) return;
        setActionNotice('');
        setActionError(saveError instanceof Error ? saveError.message : 'Could not save your Flutterwave card token.');
      } finally {
        if (!cancelled) setSetupLoading(false);
      }
    };

    void saveToken();

    return () => { cancelled = true; };
  }, [loadProfile, navigate, searchParams]);

  const handleStripeSetup = async () => {
    if (!termsAccepted) {
      setActionError('Please accept the terms & conditions before saving a payment method.');
      return;
    }

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

      setActionNotice('Payment method saved. Your recurring contributions can now be charged automatically.');
      await loadProfile();
    } catch (setupError) {
      setActionError(setupError instanceof Error ? setupError.message : 'Could not save your payment method.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleFlutterwaveSetup = async () => {
    if (!termsAccepted) {
      setActionError('Please accept the terms & conditions before saving a payment method.');
      return;
    }

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
        body: JSON.stringify({}),
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

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Add Payment Method — PadiHub</title>
        <meta name="description" content="Add a payment method to authorize your recurring group contributions on PadiHub." />
        <link rel="canonical" href="https://padihub.com/payments/methods" />
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
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Add payment method</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Save a card so PadiHub can automatically charge your recurring group contributions when they&apos;re due.
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
                    <p className="text-xs text-gray-500 mb-1">Payment provider</p>
                    <p className="font-bold text-gray-900">{profile?.country === 'NG' ? 'Flutterwave (NG)' : 'Stripe (GB)'}</p>
                  </div>
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full"
                    style={{
                      color: hasSavedPaymentMethod ? '#2EAF6F' : '#F59E0B',
                      background: hasSavedPaymentMethod ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                    }}
                  >
                    {hasSavedPaymentMethod ? 'Verified' : 'Not saved yet'}
                  </span>
                </div>

                {hasSavedPaymentMethod ? (
                  <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
                    <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                    <p className="text-sm text-gray-700">
                      You have a verified payment method on file. It will be used automatically for your group contributions.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="flex items-start gap-3 rounded-2xl p-4 cursor-pointer" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <Checkbox checked={termsAccepted} onCheckedChange={value => setTermsAccepted(value === true)} className="mt-0.5" />
                      <span className="text-sm text-gray-700">
                        I authorize PadiHub to securely store this payment method and charge it automatically for my recurring
                        group contributions, in line with the{' '}
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
                      <div className="space-y-4">
                        <div className="rounded-2xl p-3 bg-white text-sm text-gray-600" style={{ border: '1px solid #E5E7EB' }}>
                          Flutterwave will open a secure hosted checkout to verify and tokenise your card for future contribution charges.
                        </div>
                        <button
                          onClick={() => void handleFlutterwaveSetup()}
                          disabled={setupLoading || !termsAccepted}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                        >
                          {setupLoading ? 'Opening checkout…' : 'Continue to secure checkout'}
                          {!setupLoading && <ExternalLink size={16} />}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-2xl bg-white px-4 py-3" style={{ border: '1px solid #E5E7EB' }}>
                          <div ref={cardMountRef} />
                        </div>
                        <button
                          onClick={() => void handleStripeSetup()}
                          disabled={setupLoading || !STRIPE_PUBLISHABLE_KEY || !termsAccepted}
                          className="w-full py-3 rounded-2xl font-bold text-white inline-flex items-center justify-center gap-2 transition-all disabled:cursor-not-allowed disabled:opacity-60"
                          style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)' }}
                        >
                          <CreditCard size={16} />
                          {setupLoading ? 'Saving card…' : 'Save card with Stripe'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Link
                to="/payments/payout"
                className="flex items-center justify-between rounded-2xl p-4 bg-white transition-all hover:opacity-90"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div>
                  <p className="font-bold text-gray-900 text-sm">Connect payout destination</p>
                  <p className="text-xs text-gray-500 mt-0.5">Set up where you&apos;ll receive money when it&apos;s your turn in the rotation.</p>
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
