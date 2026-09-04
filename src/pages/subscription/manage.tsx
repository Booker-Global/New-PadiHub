import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, CreditCard, CheckCircle, Shield, XCircle, ArrowRight, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

/** Mirrors src/pages/verify-identity.tsx's getReturnPath/getReturnLabel — a
 * member who arrived here from an invite's onboarding checklist (join.tsx)
 * needs a way back, otherwise they're stranded after choosing a plan and
 * never actually finish joining. */
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

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

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

type SwitchPlanResult = {
  tier?: TierKey;
  direction?: 'upgrade' | 'downgrade';
  effective_immediately?: boolean;
  effective_date?: string | null;
};

type OnboardingStep = {
  key: string;
  label: string;
  complete: boolean;
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

/** Fetches the member's real onboarding progress and returns the labels of
 * whichever steps are still outstanding — excluding 'subscription' itself,
 * since the caller (handleSelectPlan) just finished that step. Used to build
 * an accurate "what's next" message instead of a hardcoded one that always
 * claimed payment card/payout/identity were still missing, even for members
 * who'd already completed them. Best-effort: falls back to an empty list
 * (meaning "nothing outstanding") if the status can't be fetched, since this
 * message is purely informational and must never block plan selection.
 */
async function getRemainingOnboardingStepLabels(token: string): Promise<string[]> {
  try {
    const response = await window.fetch('/api/users/onboarding-status', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!response.ok) return [];
    const json = await response.json().catch(() => null) as ApiResponse<{ steps?: OnboardingStep[] }> | null;
    const steps = json?.data?.steps ?? [];
    return steps.filter(step => !step.complete && step.key !== 'subscription').map(step => step.label);
  } catch {
    return [];
  }
}

export default function ManageMembershipPage() {
  const [searchParams] = useSearchParams();
  const returnPath = getReturnPath(searchParams);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [showSwitchDialog, setShowSwitchDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<TierKey | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refreshSubscription = async () => {
    const session = getValidSession();
    if (!session?.token) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const headers = { Authorization: 'Bearer ' + session.token };
    const [statusResponse, statsResponse] = await Promise.all([
      window.fetch('/api/subscriptions/status', { headers }),
      window.fetch('/api/users/stats', { headers }),
    ]);

    const statusPayload = await statusResponse.json().catch(() => null) as ApiResponse<SubscriptionStatus | null> | null;
    const statsPayload = await statsResponse.json().catch(() => null) as ApiResponse<UserStats> | null;

    if (!statusResponse.ok || !statusPayload?.success) {
      throw new Error(getApiErrorMessage(statusPayload, 'Unable to load your subscription status right now.'));
    }
    if (!statsResponse.ok || !statsPayload?.success || !statsPayload.data) {
      throw new Error(getApiErrorMessage(statsPayload, 'Unable to load your plan details right now.'));
    }

    setStatus(statusPayload.data ?? null);
    setStats(statsPayload.data);
  };

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        await refreshSubscription();
        if (!active) return;
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
  const nextTier = currentTier === 'premium' ? 'basic' : 'premium';
  const plan = currentTier ? tierConfig[currentTier] : null;
  const switchPlan = currentTier ? tierConfig[nextTier] : null;
  const priceLabel = currentTier ? plan?.price[currentCountry] : null;
  const switchPrice = switchPlan?.price[currentCountry] ?? null;

  const statusBadge = !status?.billing_status
    ? { label: 'No active billing', color: '#6B7280', background: 'rgba(107,114,128,0.16)' }
    : status.billing_status === 'cancelled'
      ? { label: 'Cancelled', color: '#EF4444', background: 'rgba(239,68,68,0.15)' }
      : status.billing_status === 'past_due'
        ? { label: 'Payment overdue', color: '#F59E0B', background: 'rgba(245,158,11,0.16)' }
        : status.billing_status === 'paused'
          // Section D.2 — billing is intentionally on hold until the member
          // is verified in an active (3+ member) group; a normal, expected
          // state, not a failure, so it gets its own neutral badge rather
          // than being folded into "Active".
          ? { label: 'Billing on hold', color: '#2563EB', background: 'rgba(37,99,235,0.14)' }
          : { label: 'Active', color: '#2EAF6F', background: 'rgba(46,175,111,0.2)' };

  // Only a real, billable provider subscription counts as "subscribed" — a
  // member who has merely picked a tier during onboarding (no card/billing
  // set up yet) should not see switch/cancel controls for a subscription
  // that doesn't actually exist yet.
  const isSubscribed = Boolean(status?.provider_subscription_id) && status?.billing_status !== 'cancelled';
  // Whether a real provider subscription has ever been created (even if
  // since cancelled) — used to decide whether to show the Cancel/Reactivate
  // card at all, per PR25's switch-and-cancel support.
  const hasEverSubscribed = Boolean(status?.provider_subscription_id);

  const switchDescription = useMemo(() => {
    if (!switchTarget) return '';
    const targetPlan = tierConfig[switchTarget];
    const targetPrice = targetPlan.price[currentCountry];
    const direction = currentTier === 'basic' && switchTarget === 'premium' ? 'upgrade' : 'downgrade';

    if (!status?.provider_subscription_id || status.billing_status === 'cancelled') {
      return `Your ${targetPlan.name} preference will update now. Billing will start once you finish onboarding and are a verified member of an active group with at least 3 members.`;
    }

    if (direction === 'downgrade') {
      return `You'll continue on your current plan until ${renewalDate ?? 'your next renewal date'}, then switch to ${targetPlan.name} at ${targetPrice} per month.`;
    }

    return `Your upgrade takes effect immediately. You'll move to ${targetPlan.name} now, and your regular monthly billing date remains ${renewalDate ?? 'on your existing schedule'}.`;
  }, [currentCountry, currentTier, renewalDate, status?.billing_status, status?.provider_subscription_id, switchTarget]);

  const planFeatures = plan
    ? [
      plan.createLimit === 0 ? 'Cannot create a savings group' : `Create up to ${plan.createLimit} groups`,
      `Join up to ${plan.joinLimit} savings groups`,
      'Governance, voting and Trust Score access',
      'Priority support and onboarding guidance',
    ]
    : ['Choose a monthly plan to unlock your savings-group limits'];

  const handleSwitch = async () => {
    if (!switchTarget) return;
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Your session has expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const response = await window.fetch('/api/subscriptions/switch-plan', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier: switchTarget }),
      });

      const payload = await response.json().catch(() => null) as ApiResponse<SwitchPlanResult> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to switch your plan right now.'));
      }

      const targetPlan = tierConfig[switchTarget];
      const targetPriceLabel = targetPlan.price[currentCountry];
      const effectiveDate = formatDate(payload?.data?.effective_date);

      if (payload?.data?.direction === 'downgrade') {
        setActionNotice(`You're staying on your current plan until ${effectiveDate ?? renewalDate ?? 'your next renewal date'}, then switching to ${targetPlan.name} at ${targetPriceLabel}. A confirmation email has been sent.`);
      } else if (payload?.data?.direction === 'upgrade') {
        setActionNotice(`Your plan has been upgraded to ${targetPlan.name}. Your monthly billing schedule continues with the next renewal on ${effectiveDate ?? renewalDate ?? 'your existing billing date'}. A confirmation email has been sent.`);
      } else {
        setActionNotice(`${targetPlan.name} has been selected. Billing starts once you finish onboarding and are a verified member of an active group with at least 3 members.`);
      }

      await refreshSubscription();
      setShowSwitchDialog(false);
      setSwitchTarget(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to switch your plan right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSelectPlan = async (tier: TierKey) => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Your session has expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const response = await window.fetch('/api/subscriptions/select-plan', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier }),
      });

      const payload = await response.json().catch(() => null) as ApiResponse<unknown> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to select that plan right now.'));
      }

      await refreshSubscription();
      // Only tell the member to add a payment card / payout details / verify
      // identity if those steps genuinely aren't done yet — this message was
      // previously hardcoded, so a member who had already completed every
      // other onboarding step (e.g. re-selecting/confirming their plan) was
      // wrongly told to redo steps they'd already finished.
      const remainingStepLabels = await getRemainingOnboardingStepLabels(session.token);
      setActionNotice(
        remainingStepLabels.length
          ? `${tierConfig[tier].name} selected. Next: ${remainingStepLabels.join('; ')} — see the steps below.`
          : `${tierConfig[tier].name} selected. Your subscription is confirmed — billing starts once you're a verified member of an active group with at least 3 members.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to select that plan right now.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelMembership = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Your session has expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    setActionError(null);
    setActionNotice(null);

    try {
      const response = await window.fetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const payload = await response.json().catch(() => null) as ApiResponse<null> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to cancel your subscription right now.'));
      }

      await refreshSubscription();
      setActionNotice(`Your subscription has been cancelled. You'll keep access until ${renewalDate ?? 'the end of your current billing period'}. A confirmation email has been sent.`);
      setShowCancelDialog(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to cancel your subscription right now.');
    } finally {
      setSubmitting(false);
    }
  };

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
        <title>Manage Membership — PadiHub</title>
        <meta name="description" content="Manage your PadiHub membership, payment method and monthly plan." />
        <link rel="canonical" href="https://padihub.com/subscription/manage" />
        <meta property="og:title" content="Manage Membership — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub membership, payment method and monthly plan." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/subscription" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Manage Membership</h1>
              <p className="text-gray-500 text-sm">Update your monthly plan and billing settings</p>
            </div>
          </MotionDiv>

          {returnPath && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Link
                to={returnPath}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
              >
                <ArrowRight size={14} /> {getReturnLabel(returnPath)}
              </Link>
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

          {actionNotice && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert className="rounded-2xl border-[#2EAF6F]/20 bg-[#2EAF6F]/5">
                <AlertTitle className="text-[#2EAF6F]">Membership updated</AlertTitle>
                <AlertDescription>{actionNotice}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          {actionError && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>We couldn't update your membership</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
            <div className="relative">
              <div className="flex items-start justify-between mb-4 gap-4">
                <div className="min-w-0">
                  <span className="text-xs font-bold px-3 py-1 rounded-full mb-2 inline-block" style={{ background: statusBadge.background, color: statusBadge.color }}>
                    {statusBadge.label}
                  </span>
                  <h2 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    {plan ? plan.name : 'No plan selected yet'}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {plan
                      ? `${priceLabel} per month${renewalDate ? ` · Next billing ${renewalDate}` : ''}`
                      : 'Choose Basic or Premium to set your monthly membership.'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-2xl sm:text-3xl font-black text-white whitespace-nowrap" style={{ fontFamily: 'Nunito, sans-serif' }}>{priceLabel ?? '—'}</p>
                  <p className="text-gray-400 text-xs whitespace-nowrap">monthly</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {planFeatures.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <CheckCircle size={12} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-5" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  {isSubscribed ? 'Switch plan' : 'Choose your subscription plan'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {isSubscribed
                    ? 'Monthly plans only. Changes send a confirmation email automatically.'
                    : 'Pick Basic or Premium to get started. Your subscription is only charged once your payment method, payout details and identity verification are all in place.'}
                </p>
              </div>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.08)' }}>
                <RefreshCw size={18} style={{ color: '#2EAF6F' }} />
              </div>
            </div>

            {isSubscribed && switchPlan ? (
              <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="font-bold text-gray-900 text-sm">Switch to {switchPlan.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {switchPrice} per month · {switchPlan.createLimit === 0 ? 'Cannot create groups' : `Create up to ${switchPlan.createLimit} groups`} · Join up to {switchPlan.joinLimit} groups
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSwitchTarget(nextTier);
                      setShowSwitchDialog(true);
                    }}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    Switch plan <ArrowRight size={14} />
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  {currentTier === 'premium'
                    ? `Downgrades stay on your current plan until ${renewalDate ?? 'your next billing date'}.`
                    : `Upgrades apply immediately and keep your monthly billing schedule anchored to ${renewalDate ?? 'your current renewal date'}.`}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(Object.keys(tierConfig) as TierKey[]).map((tierKey) => {
                  const tierData = tierConfig[tierKey];
                  return (
                    <div key={tierKey} className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{tierData.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {tierData.price[currentCountry]} per month · {tierData.createLimit === 0 ? 'Cannot create groups' : `Create up to ${tierData.createLimit} groups`} · Join up to {tierData.joinLimit} groups
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => { void handleSelectPlan(tierKey); }}
                        className="inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-all hover:opacity-90 disabled:opacity-60"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                      >
                        Choose {tierData.name} <ArrowRight size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-5" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Payment method</h2>
                <p className="text-sm text-gray-500 mt-1">Manage your saved card or mobile-money setup on the secure payment methods page.</p>
              </div>
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: '#F9FAFB' }}>
                <CreditCard size={18} style={{ color: '#2EAF6F' }} />
              </div>
            </div>

            <div className="rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ background: '#F9FAFB' }}>
              <div>
                <p className="font-bold text-gray-900 text-sm">Update payment method</p>
                <p className="text-xs text-gray-500 mt-1">Use the existing payments flow to add or replace the card used for your monthly membership. Your billing address is confirmed there alongside your card.</p>
              </div>
              <Link
                to="/payments/methods"
                className="inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors hover:bg-gray-100"
                style={{ color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}
              >
                Open payment methods <ArrowRight size={14} />
              </Link>
            </div>
          </MotionDiv>

          {hasEverSubscribed && (
            <MotionDiv variants={fadeUp} className="rounded-3xl p-5 flex items-center justify-between gap-4" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div className="flex items-center gap-3">
                <XCircle size={20} style={{ color: '#EF4444' }} />
                <div>
                  <p className="font-bold text-gray-900 text-sm">Cancel Subscription</p>
                  <p className="text-xs text-gray-500">{status?.billing_status === 'cancelled' ? 'Your subscription is already cancelled.' : `You'll keep access until ${renewalDate ?? 'the end of your current billing period'}.`}</p>
                </div>
              </div>
              {status?.billing_status === 'cancelled' ? (
                <Link
                  to="/subscription/renew"
                  className="text-sm font-bold px-4 py-2 rounded-xl transition-colors hover:bg-green-50"
                  style={{ color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}
                >
                  Reactivate
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCancelDialog(true)}
                  className="text-sm font-bold px-4 py-2 rounded-xl transition-colors hover:bg-red-50"
                  style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  Cancel
                </button>
              )}
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400">
            <Shield size={12} style={{ color: '#2EAF6F' }} />
            Secured with 256-bit SSL encryption · PadiHub never stores your full card details
          </MotionDiv>
        </MotionDiv>
      </div>

      <ConfirmDialog
        open={showSwitchDialog}
        title={switchTarget ? `Switch to ${tierConfig[switchTarget].name}?` : 'Switch plan?'}
        description={switchDescription}
        confirmLabel={submitting ? 'Updating…' : 'Confirm switch'}
        cancelLabel="Keep current plan"
        onConfirm={() => { void handleSwitch(); }}
        onCancel={() => {
          if (submitting) return;
          setShowSwitchDialog(false);
          setSwitchTarget(null);
        }}
      />

      <ConfirmDialog
        open={showCancelDialog}
        title="Cancel your subscription?"
        description={`You'll keep access until ${renewalDate ?? 'the end of your current billing period'}. We'll send a confirmation email straight away.`}
        confirmLabel={submitting ? 'Cancelling…' : 'Yes, cancel'}
        cancelLabel="Keep my subscription"
        variant="danger"
        onConfirm={() => { void handleCancelMembership(); }}
        onCancel={() => {
          if (submitting) return;
          setShowCancelDialog(false);
        }}
      />
    </DashboardLayout>
  );
}
