import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, Clock, AlertTriangle, PiggyBank, Shield } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

interface SavingsGroup {
  id: string;
  name: string;
  currency: 'GBP' | 'NGN';
}

interface Contribution {
  id: string;
  group_id: string;
  cycle_number: number;
  amount_due: string | number;
  amount_paid?: string | number | null;
  due_date: string;
  paid_date?: string | null;
  payment_status: 'scheduled' | 'due' | 'paid' | 'failed' | 'missed';
  provider_reference?: string | null;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[] | undefined>;
}

type ChargeStatus = 'succeeded' | 'pending' | 'failed';

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

function formatDate(date: string | null | undefined) {
  if (!date) return 'Not available';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Not available';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function mapContributionStatus(status?: Contribution['payment_status'] | null): ChargeStatus {
  switch (status) {
    case 'paid':
      return 'succeeded';
    case 'failed':
    case 'missed':
      return 'failed';
    default:
      return 'pending';
  }
}

export default function ContributionSuccessPage() {
  const [searchParams] = useSearchParams();
  const contributionId = searchParams.get('contribution_id') ?? '';
  const groupIdFromQuery = searchParams.get('group_id') ?? '';
  const statusFromQuery = searchParams.get('status') as ChargeStatus | null;
  const [contribution, setContribution] = useState<Contribution | null>(null);
  const [group, setGroup] = useState<SavingsGroup | null>(null);
  const [loading, setLoading] = useState(Boolean(contributionId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!contributionId) {
      setLoading(false);
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view contribution details.');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadDetails = async () => {
      setLoading(true);
      setError('');

      try {
        const headers = { Authorization: 'Bearer ' + session.token };
        const contributionsResponse = await window.fetch('/api/contributions', { headers });
        const contributionsJson = await contributionsResponse.json().catch(() => null) as ApiResponse<Contribution[]> | null;
        if (!contributionsResponse.ok) {
          throw new Error(getErrorMessage(contributionsJson, 'Could not load your contribution details.'));
        }

        const contributionRow = (Array.isArray(contributionsJson?.data) ? contributionsJson.data : [])
          .find(row => row.id === contributionId);

        if (!contributionRow) {
          throw new Error('Contribution not found.');
        }

        const groupId = contributionRow.group_id || groupIdFromQuery;
        let groupRow: SavingsGroup | null = null;
        if (groupId) {
          const groupResponse = await window.fetch(`/api/groups/${groupId}`, { headers });
          const groupJson = await groupResponse.json().catch(() => null) as ApiResponse<SavingsGroup> | null;
          if (groupResponse.ok) {
            groupRow = groupJson?.data ?? null;
          }
        }

        if (cancelled) return;
        setContribution(contributionRow);
        setGroup(groupRow);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'Could not load your contribution details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [contributionId, groupIdFromQuery]);

  const effectiveStatus = useMemo<ChargeStatus>(() => {
    if (statusFromQuery === 'succeeded' || statusFromQuery === 'pending' || statusFromQuery === 'failed') {
      return statusFromQuery;
    }
    return mapContributionStatus(contribution?.payment_status);
  }, [contribution?.payment_status, statusFromQuery]);

  const statusMeta = useMemo(() => {
    switch (effectiveStatus) {
      case 'succeeded':
        return {
          title: 'Contribution received',
          description: 'Your payment was confirmed and your contribution has been recorded.',
          tone: '#2EAF6F',
          icon: CheckCircle,
        };
      case 'failed':
        return {
          title: 'Contribution not completed',
          description: 'The payment provider did not confirm this contribution. Please return and try again.',
          tone: '#EF4444',
          icon: AlertTriangle,
        };
      default:
        return {
          title: 'Payment processing',
          description: 'Your payment is still processing. We will update your contribution once the provider confirms it.',
          tone: '#F59E0B',
          icon: Clock,
        };
    }
  }, [effectiveStatus]);

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  const StatusIcon = statusMeta.icon;
  const resolvedGroupId = group?.id || contribution?.group_id || groupIdFromQuery;
  const amount = contribution && group ? formatCurrency(contribution.amount_due, group.currency) : null;

  return (
    <DashboardLayout>
      <Helmet>
        <title>{statusMeta.title} — PadiHub</title>
        <meta name="description" content={statusMeta.description} />
        <link rel="canonical" href="https://padihub.com/savings-groups/contribution-success" />
        <meta property="og:title" content={`${statusMeta.title} — PadiHub`} />
        <meta property="og:description" content={statusMeta.description} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
          <div className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: `${statusMeta.tone}16` }}>
            <StatusIcon size={44} style={{ color: statusMeta.tone }} />
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
            {statusMeta.title}
          </h1>
          <p className="text-gray-500 mb-8">{statusMeta.description}</p>

          {error ? (
            <div className="rounded-3xl p-5 mb-6 text-left bg-white" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
                <p className="text-sm text-gray-700">{error}</p>
              </div>
            </div>
          ) : contribution ? (
            <div className="rounded-3xl p-6 mb-6 text-left bg-white" style={{ border: '1px solid #E5E7EB' }}>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: `${statusMeta.tone}16` }}>
                  <PiggyBank size={18} style={{ color: statusMeta.tone }} />
                </div>
                <div>
                  <p className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{group?.name ?? 'Savings group'}</p>
                  <p className="text-xs text-gray-500">Contribution ID: {contribution.id}</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                  <p className="text-xs text-gray-500 mb-1">Amount</p>
                  <p className="font-bold text-gray-900">{amount ?? 'Not available'}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                  <p className="text-xs text-gray-500 mb-1">Cycle</p>
                  <p className="font-bold text-gray-900">Cycle {contribution.cycle_number}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                  <p className="text-xs text-gray-500 mb-1">Due date</p>
                  <p className="font-bold text-gray-900">{formatDate(contribution.due_date)}</p>
                </div>
                <div className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                  <p className="text-xs text-gray-500 mb-1">Current record status</p>
                  <p className="font-bold text-gray-900">{contribution.payment_status}</p>
                </div>
              </div>

              <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                <Shield size={16} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                <p className="text-sm text-gray-700">
                  {effectiveStatus === 'succeeded'
                    ? 'Your contribution has been confirmed. Any provider webhooks will reconcile the record if needed.'
                    : effectiveStatus === 'pending'
                      ? 'The payment is still with the provider. Refresh this page or check back later to see the final status.'
                      : 'No contribution was recorded from this attempt. Please go back and try again after updating your payment method if needed.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl p-6 mb-6 bg-white" style={{ border: '1px solid #E5E7EB' }}>
              <p className="text-sm text-gray-600">This screen reflects the result of your last contribution attempt. No mock data is shown here.</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/dashboard"
              className="flex-1 py-3.5 rounded-2xl font-bold text-white text-center transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
            >
              Return to dashboard
            </Link>
            <Link
              to={resolvedGroupId ? `/savings-groups/${resolvedGroupId}` : '/savings-groups'}
              className="flex-1 py-3.5 rounded-2xl font-bold text-gray-700 text-center hover:bg-gray-50 transition-colors"
              style={{ border: '1px solid #E5E7EB' }}
            >
              View savings group
            </Link>
          </div>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
