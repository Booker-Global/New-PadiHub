import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, AlertCircle, CheckCircle, Shield, Users, TrendingUp, ArrowRight, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const tierConfig = {
  pro: { name: 'Pro Group', createLimit: 1, joinLimit: 5, price: { GB: '£4.99', NG: '₦5,000' } },
  elite: { name: 'Elite Group', createLimit: 7, joinLimit: 10, price: { GB: '£9.99', NG: '₦10,000' } },
} as const;

type TierKey = keyof typeof tierConfig;
type CountryCode = 'GB' | 'NG';
type Step = 'confirm' | 'reason' | 'cancelled';

type ApiResponse<T> = { success?: boolean; data?: T; message?: string };
type SubscriptionStatus = {
  billing_status?: 'active' | 'past_due' | 'cancelled' | 'trialing' | null;
  renewal_date?: string | null;
  plan?: string | null;
  provider?: 'stripe' | 'flutterwave' | null;
};
type UserStats = { subscription_tier?: TierKey | null; country?: CountryCode | null };

const lossItems = [
  { icon: Users, label: 'Access to your monthly group limits', color: '#2EAF6F' },
  { icon: Shield, label: 'Your Trust Score™ progress', color: '#2eafaf' },
  { icon: TrendingUp, label: 'Participation in active savings groups', color: '#8B5CF6' },
];

const reasons = [
  'Too expensive',
  'Not using it enough',
  'Missing features I need',
  'Found a better alternative',
  'Technical issues',
  'Temporary — I\'ll be back',
  'Other',
];

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function isTierKey(value: string | null | undefined): value is TierKey {
  return value === 'pro' || value === 'elite';
}

function getTierFromPlan(plan?: string | null): TierKey | null {
  if (!plan) return null;
  if (plan.endsWith('_elite')) return 'elite';
  if (plan.endsWith('_pro')) return 'pro';
  return null;
}

function getCountryFromStatus(status?: SubscriptionStatus | null): CountryCode | null {
  if (status?.plan?.startsWith('ng_') || status?.provider === 'flutterwave') return 'NG';
  if (status?.plan?.startsWith('gb_') || status?.provider === 'stripe') return 'GB';
  return null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function CancelMembershipPage() {
  const navigate = useNavigate();
  const [loadingPage, setLoadingPage] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('confirm');
  const [selectedReason, setSelectedReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const session = getValidSession();
      if (!session?.token) {
        if (!active) return;
        setPageError('Your session has expired. Please sign in again.');
        setLoadingPage(false);
        return;
      }

      try {
        const headers = { Authorization: 'Bearer ' + session.token };
        const [statusResponse, statsResponse] = await Promise.all([
          window.fetch('/api/subscriptions/status', { headers }),
          window.fetch('/api/users/stats', { headers }),
        ]);
        const statusPayload = await statusResponse.json().catch(() => null) as ApiResponse<SubscriptionStatus | null> | null;
        const statsPayload = await statsResponse.json().catch(() => null) as ApiResponse<UserStats> | null;

        if (!statusResponse.ok || !statusPayload?.success) {
          throw new Error(getApiErrorMessage(statusPayload, 'Unable to load your membership status.'));
        }
        if (!statsResponse.ok || !statsPayload?.success || !statsPayload.data) {
          throw new Error(getApiErrorMessage(statsPayload, 'Unable to load your membership details.'));
        }

        if (!active) return;
        setStatus(statusPayload.data ?? null);
        setStats(statsPayload.data);
        setPageError(statusPayload.data ? null : 'No active subscription was found to cancel.');
        if (statusPayload.data?.billing_status === 'cancelled') {
          setStep('cancelled');
        }
      } catch (error) {
        if (!active) return;
        setPageError(error instanceof Error ? error.message : 'Unable to load your membership details.');
      } finally {
        if (active) setLoadingPage(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const currentTier = useMemo(
    () => (isTierKey(stats?.subscription_tier) ? stats?.subscription_tier : getTierFromPlan(status?.plan)),
    [stats?.subscription_tier, status?.plan],
  );
  const currentCountry = (stats?.country ?? getCountryFromStatus(status) ?? 'GB') as CountryCode;
  const currentPlan = currentTier ? tierConfig[currentTier] : null;
  const renewalDate = formatDate(status?.renewal_date);
  const alternativeTier = currentTier === 'elite' ? tierConfig.pro : tierConfig.elite;

  const handleCancel = async () => {
    if (!selectedReason || loading) return;

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Your session has expired. Please sign in again.');
      return;
    }

    setLoading(true);
    setActionError(null);

    try {
      const response = await window.fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const payload = await response.json().catch(() => null) as ApiResponse<null> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to cancel your membership right now.'));
      }

      setStatus((current) => current ? { ...current, billing_status: 'cancelled' } : current);
      setStep('cancelled');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to cancel your membership right now.');
    } finally {
      setLoading(false);
    }
  };

  if (loadingPage) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Cancel Membership — PadiHub</title>
        <meta name="description" content="Cancel your PadiHub membership." />
        <link rel="canonical" href="https://padihub.com/subscription/cancel" />
        <meta property="og:title" content="Cancel Membership — PadiHub" />
        <meta property="og:description" content="Cancel your PadiHub membership." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          {step !== 'cancelled' && (
            <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
              <Link to="/subscription/manage" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                <ChevronLeft size={16} /> Back
              </Link>
              <div>
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Cancel Membership</h1>
                <p className="text-gray-500 text-sm">We'll confirm your access end date before anything changes.</p>
              </div>
            </MotionDiv>
          )}

          {pageError && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Unable to load membership details</AlertTitle>
                <AlertDescription>{pageError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          {actionError && step !== 'cancelled' && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>We couldn't cancel your membership</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          {pageError && !status ? (
            <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
              <p className="text-sm text-gray-600 mb-4">If you still need help with billing, visit your membership settings or payment methods page.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/subscription/manage"
                  className="flex-1 py-3 rounded-2xl font-bold text-white text-center"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                >
                  Manage membership
                </Link>
                <Link
                  to="/payments/methods"
                  className="flex-1 py-3 rounded-2xl font-bold text-gray-600 text-center hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #E5E7EB' }}
                >
                  Update payment method
                </Link>
              </div>
            </MotionDiv>
          ) : (
          <AnimatePresence mode="wait">
            {step === 'confirm' && (
              <MotionDiv key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="rounded-2xl p-4 mb-6 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={20} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#EF4444' }}>Are you sure you want to cancel?</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      You'll keep full access until <strong>{renewalDate ?? 'the end of your current billing period'}</strong>.
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl p-5 bg-white mb-6" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <p className="font-bold text-gray-900 mb-4 text-sm">You'll lose access to:</p>
                  <div className="flex flex-col gap-3">
                    {lossItems.map((item) => (
                      <div key={item.label} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}12` }}>
                          <item.icon size={16} style={{ color: item.color }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl p-5 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                  <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: '#2EAF6F' }} />
                  <div className="relative flex items-start gap-3">
                    <RefreshCw size={20} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p className="font-bold text-white text-sm mb-1">Need a different monthly plan instead?</p>
                      <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {currentPlan
                          ? `Switch to ${alternativeTier.name} at ${alternativeTier.price[currentCountry]} per month instead of cancelling altogether.`
                          : 'You can review your monthly plan options from your membership settings.'}
                      </p>
                      <Link
                        to="/subscription/manage"
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-all hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                      >
                        Review plans <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setStep('reason')}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-colors hover:bg-red-50"
                    style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}
                    type="button"
                  >
                    Continue with cancellation
                  </button>
                  <Link
                    to="/subscription/manage"
                    className="w-full py-3.5 rounded-2xl font-bold text-sm text-center transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    Keep my membership
                  </Link>
                </div>
              </MotionDiv>
            )}

            {step === 'reason' && (
              <MotionDiv key="reason" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }}>
                <div className="rounded-3xl p-6 bg-white mb-5" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <p className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Why are you leaving?</p>
                  <p className="text-sm text-gray-500 mb-5">Your feedback helps us improve PadiHub for everyone.</p>

                  <div className="flex flex-col gap-2 mb-5">
                    {reasons.map((reason) => (
                      <button
                        key={reason}
                        onClick={() => setSelectedReason(reason)}
                        className="flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                        style={{
                          background: selectedReason === reason ? 'rgba(46,175,111,0.06)' : '#F9FAFB',
                          border: selectedReason === reason ? '2px solid #2EAF6F' : '2px solid transparent',
                        }}
                        type="button"
                      >
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0" style={{ borderColor: selectedReason === reason ? '#2EAF6F' : '#D1D5DB' }}>
                          {selectedReason === reason && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#2EAF6F' }} />}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{reason}</span>
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors resize-none"
                    rows={3}
                    placeholder="Any additional feedback? (optional)"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => { void handleCancel(); }}
                    disabled={!selectedReason || loading}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
                    style={{
                      background: selectedReason ? 'rgba(239,68,68,0.08)' : '#F3F4F6',
                      color: selectedReason ? '#EF4444' : '#9CA3AF',
                      border: selectedReason ? '1px solid rgba(239,68,68,0.25)' : '1px solid #E5E7EB',
                      cursor: selectedReason ? 'pointer' : 'not-allowed',
                    }}
                    type="button"
                  >
                    {loading ? 'Cancelling…' : 'Confirm cancellation'}
                  </button>
                  <button
                    onClick={() => setStep('confirm')}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                    style={{ border: '1px solid #E5E7EB' }}
                    type="button"
                  >
                    Go back
                  </button>
                </div>
              </MotionDiv>
            )}

            {step === 'cancelled' && (
              <MotionDiv key="cancelled" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} className="text-center py-8">
                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.2)' }}>
                  <CheckCircle size={36} style={{ color: '#EF4444' }} />
                </div>

                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Membership cancelled
                </h2>
                <p className="text-gray-500 mb-2">
                  Your {currentPlan?.name ?? 'membership'} has been cancelled. You'll keep full access until <strong>{renewalDate ?? 'the end of your current billing period'}</strong>.
                </p>
                <p className="text-sm text-gray-400 mb-8">A confirmation email has been sent to your inbox.</p>

                <div className="rounded-2xl p-4 mb-8 flex items-center gap-3 text-left" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                  <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                  <p className="text-sm text-gray-600">
                    Changed your mind? You can <Link to="/subscription/renew" className="font-bold underline" style={{ color: '#2EAF6F' }}>reactivate your membership</Link> before your current billing period ends.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => navigate('/subscription/renew')}
                    className="px-6 py-3 rounded-2xl font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                    type="button"
                  >
                    Reactivate membership
                  </button>
                  <Link
                    to="/dashboard"
                    className="px-6 py-3 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors text-center"
                    style={{ border: '1px solid #E5E7EB' }}
                  >
                    Back to dashboard
                  </Link>
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
