import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, PiggyBank, Users, Shield, Calendar, CheckCircle, ArrowRight, AlertTriangle, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

interface SavingsGroup {
  id: string;
  name: string;
  description?: string | null;
  leader_id: string;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'daily' | 'weekly' | 'monthly';
  payout_day?: number | null;
  maximum_members: number;
  rotation_method: 'manual' | 'random';
  current_cycle: number;
  status: 'active' | 'closed' | 'suspended';
  created_at: string;
}

interface Membership {
  id: string;
  status: 'pending' | 'active' | 'suspended' | 'removed';
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, string[] | undefined>;
}

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

function getGroupColor(group: SavingsGroup) {
  if (group.status === 'closed') return '#6B7280';
  if (group.status === 'suspended') return '#F59E0B';
  return group.currency === 'NGN' ? '#2EAF6F' : '#2eafaf';
}

/** Mirrors src/server/lib/payoutSchedule.ts describePayoutSchedule() for client-side display. */
function describePayoutSchedule(frequency: SavingsGroup['contribution_frequency'], payoutDay: number | null | undefined) {
  if (frequency === 'daily') return 'Every day';
  if (frequency === 'weekly') {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const idx = payoutDay !== null && payoutDay !== undefined ? Math.min(6, Math.max(0, payoutDay)) : 0;
    return `Every ${names[idx]}`;
  }
  const day = payoutDay !== null && payoutDay !== undefined ? Math.min(31, Math.max(1, payoutDay)) : 1;
  const suffix = day % 10 === 1 && day !== 11 ? 'st'
    : day % 10 === 2 && day !== 12 ? 'nd'
    : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `Monthly on the ${day}${suffix}`;
}

export default function JoinSavingsGroupPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [group, setGroup] = useState<SavingsGroup | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [needsPaymentSetup, setNeedsPaymentSetup] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const inviteToken = useMemo(
    () => searchParams.get('invite_token') || searchParams.get('invite') || searchParams.get('token') || undefined,
    [searchParams],
  );

  const loadData = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to join this savings group.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    setNotFound(false);

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const groupResponse = await window.fetch(`/api/groups/${id}`, { headers });
      const groupJson = await groupResponse.json() as ApiResponse<SavingsGroup>;

      if (!groupResponse.ok) {
        const message = getErrorMessage(groupJson, 'Could not load this group.');
        if (groupResponse.status === 404) {
          setNotFound(true);
          setGroup(null);
          return;
        }
        throw new Error(message);
      }

      setGroup(groupJson.data ?? null);

      const membershipsResponse = await window.fetch(`/api/memberships?group_id=${id}`, { headers });
      if (membershipsResponse.ok) {
        const membershipsJson = await membershipsResponse.json() as ApiResponse<Membership[]>;
        const memberships = Array.isArray(membershipsJson.data) ? membershipsJson.data : [];
        setMemberCount(memberships.filter(member => member.status === 'active').length);
      } else {
        setMemberCount(0);
      }
    } catch (loadError) {
      setGroup(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load this group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleJoin = async () => {
    if (!group) return;

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to join this savings group.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNeedsPaymentSetup(false);

    try {
      const response = await window.fetch('/api/memberships', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_id: group.id,
          ...(inviteToken ? { invite_token: inviteToken } : {}),
        }),
      });

      const json = await response.json() as ApiResponse<null>;
      if (!response.ok) {
        setError(getErrorMessage(json, 'Could not join this group.'));
        setNeedsPaymentSetup(json.code === 'PAYMENT_SETUP_REQUIRED');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  if (notFound) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto text-center py-16">
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Group not found</h1>
          <p className="text-gray-500 mb-6">The savings group you&apos;re trying to join could not be found.</p>
          <Link to="/savings-groups" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            <ChevronLeft size={16} /> Back to savings groups
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (error && !group) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto text-center py-16">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle size={24} style={{ color: '#EF4444' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load this group</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      </DashboardLayout>
    );
  }

  if (!group) {
    return null;
  }

  const groupColor = getGroupColor(group);
  const availableSpots = Math.max(group.maximum_members - memberCount, 0);

  if (success) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto text-center py-16">
          <MotionDiv initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)`, boxShadow: `0 0 40px ${groupColor}50` }}>
            <CheckCircle size={36} color="#fff" />
          </MotionDiv>
          <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>You&apos;ve joined! 🎉</h2>
          <p className="text-gray-500 mb-8">Welcome to <strong>{group.name}</strong>. You can now view the group and track your contributions.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to={`/savings-groups/${group.id}`} className="px-6 py-3 rounded-2xl font-bold text-white hover:opacity-90 transition-all" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
              View group
            </Link>
            <Link to="/savings-groups" className="px-6 py-3 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors text-center" style={{ border: '1px solid #E5E7EB' }}>
              All groups
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Join {group.name} — PadiHub</title>
        <meta name="description" content={`Join ${group.name} savings group on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${group.id}/join`} />
        <meta property="og:title" content={`Join ${group.name} — PadiHub`} />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://padihub.com/savings-groups/${group.id}/join`} />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <div className="mb-5">
          <Link to="/savings-groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
        </div>

        <div className="rounded-3xl p-6 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: groupColor }} />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
              <PiggyBank size={24} color="#fff" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</h1>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{titleCase(group.status)} · Created {formatDate(group.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl p-5 bg-white mb-5" style={{ border: '1px solid #E5E7EB' }}>
          <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Group details</h2>
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">{group.description || 'This group has not added a description yet.'}</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Contribution', value: `${formatCurrency(group.contribution_amount, group.currency)} ${titleCase(group.contribution_frequency)}`, icon: PiggyBank, color: groupColor },
              { label: 'Payout schedule', value: describePayoutSchedule(group.contribution_frequency, group.payout_day), icon: Calendar, color: '#F59E0B' },
              { label: 'Members', value: `${memberCount}/${group.maximum_members} active`, icon: Users, color: '#8B5CF6' },
              { label: 'Available spots', value: availableSpots.toString(), icon: Shield, color: '#2EAF6F' },
              { label: 'Current cycle', value: group.current_cycle.toString(), icon: Calendar, color: '#F59E0B' },
              { label: 'Rotation', value: titleCase(group.rotation_method), icon: ArrowRight, color: '#2eafaf' },
              { label: 'Country', value: group.country === 'NG' ? 'Nigeria' : 'United Kingdom', icon: Shield, color: '#6B7280' },
            ].map(row => (
              <div key={row.label} className="rounded-xl p-3" style={{ background: '#F9FAFB' }}>
                <row.icon size={12} style={{ color: row.color, marginBottom: 4 }} />
                <p className="text-sm font-bold text-gray-900">{row.value}</p>
                <p className="text-xs text-gray-400">{row.label}</p>
              </div>
            ))}
          </div>
        </div>

        {inviteToken && (
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(46,175,111,0.05)', border: '1px solid rgba(46,175,111,0.15)' }}>
            <p className="text-sm font-semibold" style={{ color: '#15803D' }}>Invitation applied</p>
            <p className="text-xs text-gray-500 mt-1">We&apos;ll use your invite token when you join this group.</p>
          </div>
        )}

        {error && (
          <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', marginBottom: 20 }}>
            {error}
          </div>
        )}

        {needsPaymentSetup && (
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <p className="text-sm font-semibold" style={{ color: '#92400E' }}>Complete payment setup to join</p>
            <p className="text-xs mt-1" style={{ color: '#92400E' }}>
              You need a verified payment method (to contribute) and a verified payout destination (to receive your payout when it&apos;s your turn) before you can join a group.
            </p>
            <div className="flex gap-3 mt-3">
              <Link to="/payments/methods" className="text-xs font-bold underline" style={{ color: '#92400E' }}>Add payment method</Link>
              <Link to="/payments/payout" className="text-xs font-bold underline" style={{ color: '#92400E' }}>Connect payout destination</Link>
            </div>
          </div>
        )}

        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <div className="relative mt-0.5">
            <input type="checkbox" className="sr-only" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all" style={{ borderColor: agreed ? groupColor : '#D1D5DB', background: agreed ? groupColor : '#fff' }}>
              {agreed && <CheckCircle size={12} color="#fff" />}
            </div>
          </div>
          <span className="text-sm text-gray-600 leading-relaxed">
            I agree to contribute <strong>{formatCurrency(group.contribution_amount, group.currency)}</strong> {group.contribution_frequency} and abide by the group rules.
          </span>
        </label>

        <div className="flex gap-3">
          <Link to="/savings-groups" className="px-5 py-3.5 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors" style={{ border: '1px solid #E5E7EB' }}>
            Cancel
          </Link>
          <button onClick={() => void handleJoin()} disabled={!agreed || submitting || needsPaymentSetup} className="flex-1 py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all" style={{ background: agreed && !needsPaymentSetup ? `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` : '#D1D5DB', cursor: agreed && !needsPaymentSetup ? 'pointer' : 'not-allowed' }}>
            {submitting ? (
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <><ArrowRight size={16} /> Join group</>
            )}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
