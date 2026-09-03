import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { CheckCircle, CreditCard, XCircle } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getValidSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const tierConfig = {
  basic: {
    name: 'Basic',
    price: { GB: '£4.99', NG: '₦5,000' },
    createLimit: 0,
    joinLimit: 3,
  },
  premium: {
    name: 'Premium',
    price: { GB: '£14.99', NG: '₦10,000' },
    createLimit: 3,
    joinLimit: 8,
  },
} as const;

type TierKey = keyof typeof tierConfig;
type CountryCode = 'GB' | 'NG';

type ApiResponse<T> = { success?: boolean; data?: T; message?: string };

type SubscriptionStatus = {
  billing_status?: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'paused' | null;
  renewal_date?: string | null;
  plan?: string | null;
  provider?: 'stripe' | 'flutterwave' | null;
  provider_subscription_id?: string | null;
};

type UserStats = {
  subscription_tier?: TierKey | null;
  country?: CountryCode | null;
};

type BillingHistoryEntry = {
  id: string;
  date: string;
  status: 'paid' | 'failed';
  provider: 'stripe' | 'flutterwave' | null;
  tier: TierKey | null;
  amount_display: string | null;
};

function isTierKey(value: string | null | undefined): value is TierKey {
  return value === 'basic' || value === 'premium';
}

function getApiErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTierFromPlan(plan?: string | null): TierKey | null {
  if (!plan) return null;
  if (plan.endsWith('_premium')) return 'premium';
  if (plan.endsWith('_basic')) return 'basic';
  return null;
}

function getCountryFromStatus(status?: SubscriptionStatus | null): CountryCode | null {
  if (status?.plan?.startsWith('ng_') || status?.provider === 'flutterwave') return 'NG';
  if (status?.plan?.startsWith('gb_') || status?.provider === 'stripe') return 'GB';
  return null;
}

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [billingHistory, setBillingHistory] = useState<BillingHistoryEntry[]>([]);

  useEffect(() => {
    let active = true;

    void (async () => {
      const session = getValidSession();
      if (!session?.token) {
        if (active) {
          setPageError('Your session has expired. Please sign in again.');
          setLoading(false);
        }
        return;
      }

      const headers = { Authorization: 'Bearer ' + session.token };

      try {
        const [statusResponse, statsResponse, billingResponse] = await Promise.all([
          window.fetch('/api/subscriptions/status', { headers }),
          window.fetch('/api/users/stats', { headers }),
          window.fetch('/api/subscriptions/billing-history', { headers }),
        ]);

        const statusPayload = await statusResponse.json().catch(() => null) as ApiResponse<SubscriptionStatus | null> | null;
        const statsPayload = await statsResponse.json().catch(() => null) as ApiResponse<UserStats> | null;
        const billingPayload = await billingResponse.json().catch(() => null) as ApiResponse<BillingHistoryEntry[]> | null;

        if (!statusResponse.ok || !statusPayload?.success) {
          throw new Error(getApiErrorMessage(statusPayload, 'Unable to load your subscription status right now.'));
        }
        if (!statsResponse.ok || !statsPayload?.success || !statsPayload.data) {
          throw new Error(getApiErrorMessage(statsPayload, 'Unable to load your plan details right now.'));
        }

        if (!active) return;
        setStatus(statusPayload.data ?? null);
        setStats(statsPayload.data);
        setBillingHistory(billingResponse.ok && billingPayload?.success ? (billingPayload.data ?? []) : []);
        setPageError(null);
      } catch (error) {
        if (!active) return;
        setPageError(error instanceof Error ? error.message : 'Unable to load your subscription right now.');
      } finally {
        if (active) setLoading(false);
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
  const renewalDate = formatDate(status?.renewal_date);
  const plan = currentTier ? tierConfig[currentTier] : null;
  const priceLabel = plan ? plan.price[currentCountry] : null;

  const statusBadge = !status?.billing_status
    ? { label: 'No active billing', color: '#6B7280', background: 'rgba(107,114,128,0.16)' }
    : status.billing_status === 'cancelled'
      ? { label: 'Cancelled', color: '#EF4444', background: 'rgba(239,68,68,0.15)' }
      : status.billing_status === 'past_due'
        ? { label: 'Payment overdue', color: '#F59E0B', background: 'rgba(245,158,11,0.16)' }
        : status.billing_status === 'paused'
          // Section D.2 — billing is intentionally on hold until the member
          // is verified in an active (3+ member) group; this is a normal,
          // expected state, not a problem, so it gets its own neutral badge
          // rather than being folded into either "Active" or a failure state.
          ? { label: 'Billing on hold', color: '#2563EB', background: 'rgba(37,99,235,0.14)' }
          : { label: 'Active', color: '#2EAF6F', background: 'rgba(46,175,111,0.2)' };

  const features = plan
    ? [
      plan.createLimit === 0 ? 'Cannot create a savings group' : `Create up to ${plan.createLimit} groups`,
      `Join up to ${plan.joinLimit} savings groups`,
      'Trust Score™ tracking',
      'Governance & voting tools',
      'Priority support',
    ]
    : ['Choose Basic or Premium to unlock your savings-group limits and Trust Score™ tracking'];

  const recentBillingHistory = billingHistory.slice(0, 4);

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Subscription & Billing — PadiHub</title>
        <meta name="description" content="Manage your PadiHub subscription, billing history and plan details." />
        <link rel="canonical" href="https://padihub.com/subscription" />
        <meta property="og:title" content="Subscription & Billing — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub subscription, billing history and plan details." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">Subscription & Billing — PadiHub</h1>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="text-2xl font-extrabold text-gray-900 mb-6" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Subscription & Billing
          </MotionDiv>

          {pageError && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Unable to load your subscription</AlertTitle>
                <AlertDescription>{pageError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: statusBadge.background, color: statusBadge.color }}>
                    {statusBadge.label}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-white mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {plan ? `${plan.name} membership` : 'No plan selected yet'}
                </h2>
                <p className="text-gray-400 text-sm">
                  {plan
                    ? status?.billing_status === 'paused'
                      ? 'Billing on hold — starts once you\'re a verified member of an active group with at least 3 members.'
                      : renewalDate
                        ? `Next billing ${renewalDate}`
                        : 'Billing starts once you\'re a verified member of an active group with at least 3 members.'
                    : 'Choose Basic or Premium to set your monthly membership.'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{priceLabel ?? '—'}</p>
                <p className="text-gray-400 text-xs">per month</p>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 className="text-base font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>What&apos;s included</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm text-gray-600">
                  <CheckCircle size={14} style={{ color: '#2EAF6F', flexShrink: 0 }} /> {feature}
                </div>
              ))}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h3 className="text-base font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Billing History</h3>
            {recentBillingHistory.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No billing history yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {recentBillingHistory.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: item.status === 'paid' ? 'rgba(46,175,111,0.1)' : 'rgba(239,68,68,0.1)' }}>
                        <CreditCard size={16} style={{ color: item.status === 'paid' ? '#2EAF6F' : '#EF4444' }} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{formatDate(item.date) ?? item.date}</p>
                        <p className="text-xs text-gray-400">{item.tier ? tierConfig[item.tier].name : 'Membership'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black" style={{ color: item.status === 'paid' ? '#2EAF6F' : '#EF4444', fontFamily: 'Nunito, sans-serif' }}>
                        {item.amount_display ?? '—'}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: item.status === 'paid' ? '#2EAF6F' : '#EF4444' }}>
                        {item.status === 'paid' ? <CheckCircle size={11} /> : <XCircle size={11} />} {item.status === 'paid' ? 'Paid' : 'Failed'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="flex flex-col gap-3">
            <Link
              to="/subscription/manage"
              className="w-full rounded-2xl font-bold text-center py-3"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
            >
              Manage membership
            </Link>
            <Link
              to="/subscription/billing"
              className="w-full py-3 rounded-2xl text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors text-center"
              style={{ border: '1px solid #E5E7EB' }}
            >
              View billing history
            </Link>
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
