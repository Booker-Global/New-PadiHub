import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronLeft, ArrowRight, Shield, RefreshCw } from 'lucide-react';
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
type ApiResponse<T> = { success?: boolean; data?: T; message?: string };
type SubscriptionStatus = {
  billing_status?: 'active' | 'past_due' | 'cancelled' | 'trialing' | null;
  renewal_date?: string | null;
  plan?: string | null;
  provider?: 'stripe' | 'flutterwave' | null;
};
type UserStats = { subscription_tier?: TierKey | null; country?: CountryCode | null };
type ReactivateResult = { renewalDate?: string | null };

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

export default function RenewMembershipPage() {
  const navigate = useNavigate();
  const [loadingPage, setLoadingPage] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        setPageError(null);
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
  const plan = currentTier ? tierConfig[currentTier] : null;
  const renewalDate = formatDate(status?.renewal_date);
  const isActive = status?.billing_status === 'active';

  const handleReactivate = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setPageError('Your session has expired. Please sign in again.');
      return;
    }

    setSubmitting(true);
    setNotice(null);
    setPageError(null);

    try {
      const response = await window.fetch('/api/subscriptions/reactivate', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const payload = await response.json().catch(() => null) as ApiResponse<ReactivateResult> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to reactivate your membership right now.'));
      }

      const nextRenewal = formatDate(payload?.data?.renewalDate);
      setNotice(`Your ${plan?.name ?? 'membership'} has been reactivated${nextRenewal ? ` and renews on ${nextRenewal}` : ''}. A confirmation email has been sent.`);
      navigate(`/subscription/success?mode=reactivated&tier=${currentTier ?? 'pro'}&country=${currentCountry}`, { replace: true });
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Unable to reactivate your membership right now.');
    } finally {
      setSubmitting(false);
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
        <title>Reactivate Membership — PadiHub</title>
        <meta name="description" content="Reactivate your monthly PadiHub membership." />
        <link rel="canonical" href="https://padihub.com/subscription/renew" />
        <meta property="og:title" content="Reactivate Membership — PadiHub" />
        <meta property="og:description" content="Reactivate your monthly PadiHub membership." />
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
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Reactivate Membership</h1>
              <p className="text-gray-500 text-sm">Restart your monthly membership on your saved plan.</p>
            </div>
          </MotionDiv>

          {pageError && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>We couldn't reactivate your membership</AlertTitle>
                <AlertDescription>{pageError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          {notice && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert className="rounded-2xl border-[#2EAF6F]/20 bg-[#2EAF6F]/5">
                <AlertTitle className="text-[#2EAF6F]">Membership updated</AlertTitle>
                <AlertDescription>{notice}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
            <div className="relative flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold px-3 py-1 rounded-full mb-2 inline-block" style={{ background: isActive ? 'rgba(46,175,111,0.2)' : 'rgba(245,158,11,0.18)', color: isActive ? '#2EAF6F' : '#F59E0B' }}>
                  {isActive ? 'Already active' : 'Ready to reactivate'}
                </span>
                <h2 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{plan?.name ?? 'No plan selected yet'}</h2>
                <p className="text-gray-400 text-sm">
                  {plan ? `${plan.price[currentCountry]} per month · Create ${plan.createLimit === 1 ? '1 group' : `up to ${plan.createLimit} groups`} · Join up to ${plan.joinLimit}` : 'Choose a plan first to continue.'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{plan?.price[currentCountry] ?? '—'}</p>
                <p className="text-gray-400 text-xs">monthly</p>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(46,175,111,0.08)' }}>
                <RefreshCw size={18} style={{ color: '#2EAF6F' }} />
              </div>
              <div>
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>What happens next</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {isActive
                    ? `Your membership is already active${renewalDate ? ` and renews on ${renewalDate}` : ''}.`
                    : `We'll restart your ${plan?.name ?? 'selected'} membership immediately${renewalDate ? ` and continue your monthly schedule with the next billing date on ${renewalDate}` : ''}.`}
                </p>
                <div className="mt-4 rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <CheckCircle size={16} style={{ color: '#2EAF6F' }} />
                    Confirmation email included
                  </div>
                  <p className="text-xs text-gray-500 mt-2">We'll email you as soon as the reactivation is complete.</p>
                </div>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="flex flex-col gap-3">
            {isActive ? (
              <Link
                to="/subscription/manage"
                className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.35)' }}
              >
                Manage membership <ArrowRight size={18} />
              </Link>
            ) : (
              <button
                onClick={() => { void handleReactivate(); }}
                disabled={!plan || submitting}
                className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.35)' }}
                type="button"
              >
                {submitting ? 'Reactivating…' : `Reactivate ${plan?.name ?? 'membership'}`} <ArrowRight size={18} />
              </button>
            )}
            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              <Shield size={11} /> Monthly plans only · Cancel anytime
            </p>
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
