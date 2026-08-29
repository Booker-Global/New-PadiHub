import { useCallback, useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, PiggyBank, Shield, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

interface SavingsGroup {
  id: string;
  name: string;
  leader_id: string;
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'weekly' | 'monthly';
  status: 'active' | 'closed' | 'suspended';
}

interface Membership {
  id: string;
  user_id: string;
  group_id: string;
  role: 'member' | 'leader';
  rotation_order?: number | null;
  status: 'pending' | 'active' | 'suspended' | 'removed';
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
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

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getGroupColor(group: SavingsGroup) {
  if (group.status === 'closed') return '#6B7280';
  if (group.status === 'suspended') return '#F59E0B';
  return group.currency === 'NGN' ? '#2EAF6F' : '#2eafaf';
}

export default function LeaveSavingsGroupPage() {
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<SavingsGroup | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(false);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const session = getValidSession();
    if (!session?.token || !session.userId) {
      setError('Please log in to leave this savings group.');
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
          setMembership(null);
          return;
        }
        throw new Error(message);
      }

      setGroup(groupJson.data ?? null);

      const membershipsResponse = await window.fetch(`/api/memberships?group_id=${id}`, { headers });
      const membershipsJson = await membershipsResponse.json() as ApiResponse<Membership[]>;
      if (!membershipsResponse.ok) {
        throw new Error(getErrorMessage(membershipsJson, 'Could not load your membership.'));
      }

      const memberships = Array.isArray(membershipsJson.data) ? membershipsJson.data : [];
      const currentMembership = memberships.find(row => row.user_id === session.userId && row.status !== 'removed') || null;
      setMembership(currentMembership);
    } catch (loadError) {
      setGroup(null);
      setMembership(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load this group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleLeave = async () => {
    if (!group) return;

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to leave this savings group.');
      return;
    }

    if (!membership) {
      setError('You are not currently a member of this group.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const response = await window.fetch(`/api/memberships/${membership.id}`, { method: 'DELETE', headers });
      const json = await response.json() as ApiResponse<null>;

      if (!response.ok) {
        setError(getErrorMessage(json, 'Could not leave this group.'));
        return;
      }

      setLeft(true);
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
          <p className="text-gray-500 mb-6">The savings group you&apos;re trying to leave could not be found.</p>
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

  if (left) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#F3F4F6' }}>
            <CheckCircle size={28} style={{ color: '#2EAF6F' }} />
          </div>
          <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>You&apos;ve left the group</h2>
          <p className="text-gray-500 mb-2">Your contribution history remains part of your <strong>PadiHub Passport™</strong>.</p>
          <p className="text-sm text-gray-400 mb-8">Your Trust Score™ is preserved.</p>
          <Link to="/savings-groups" className="px-6 py-3 rounded-2xl font-bold text-white inline-block hover:opacity-90 transition-all" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            Back to savings groups
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Leave {group.name} — PadiHub</title>
        <meta name="description" content={`Leave ${group.name} savings group on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${group.id}/leave`} />
        <meta property="og:title" content={`Leave ${group.name} — PadiHub`} />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://padihub.com/savings-groups/${group.id}/leave`} />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <div className="mb-5">
          <Link to={`/savings-groups/${group.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
        </div>

        <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <AlertTriangle size={28} style={{ color: '#EF4444' }} />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Leave this Savings Group?
            </h1>
            <p className="text-gray-500">
              You&apos;re about to leave <strong>{group.name}</strong>.
            </p>
          </div>

          <div className="rounded-3xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-20" style={{ background: groupColor }} />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
                <PiggyBank size={18} color="#fff" />
              </div>
              <div>
                <p className="font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {formatCurrency(group.contribution_amount, group.currency)} {titleCase(group.contribution_frequency)} · {titleCase(group.status)}
                </p>
              </div>
            </div>
          </div>

          {!membership && (
            <div className="rounded-2xl p-4 mb-5" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
              <p className="text-sm font-semibold text-amber-800">You are not currently a member of this group.</p>
              <p className="text-xs text-amber-700 mt-1">If you already left, there&apos;s nothing else you need to do.</p>
            </div>
          )}

          {error && (
            <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', marginBottom: 20 }}>
              {error}
            </div>
          )}

          <div className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
            <h2 className="font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>What stays with you</h2>
            <div className="flex flex-col gap-2">
              {[
                { text: 'Your full contribution history is preserved in your Passport™', icon: Shield, color: '#2EAF6F' },
                { text: 'Your Trust Score™ reflects all contributions made', icon: Shield, color: '#2EAF6F' },
              ].map(item => (
                <div key={item.text} className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'rgba(46,175,111,0.05)' }}>
                  <item.icon size={15} style={{ color: item.color, flexShrink: 0, marginTop: 1 }} />
                  <p className="text-sm text-gray-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl p-4 mb-5 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertTriangle size={15} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <p className="text-sm text-gray-600">
              Leaving mid-cycle may affect your community standing. Please notify your group leader before leaving.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <div className="relative mt-0.5">
              <input type="checkbox" className="sr-only" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
              <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all" style={{ borderColor: confirmed ? '#EF4444' : '#D1D5DB', background: confirmed ? '#EF4444' : '#fff' }}>
                {confirmed && <CheckCircle size={12} color="#fff" />}
              </div>
            </div>
            <span className="text-sm text-gray-600">
              I understand the impact of leaving this savings group{membership ? ` as a ${membership.role}.` : '.'}
            </span>
          </label>

          <div className="flex gap-3">
            <Link to={`/savings-groups/${group.id}`} className="flex-1 py-3.5 rounded-2xl font-bold text-center transition-all hover:opacity-90 text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              Stay in group
            </Link>
            <button onClick={() => void handleLeave()} disabled={!confirmed || submitting || !membership} className="flex-1 py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2" style={{ background: confirmed && membership ? 'rgba(239,68,68,0.1)' : '#F3F4F6', color: confirmed && membership ? '#EF4444' : '#9CA3AF', border: confirmed && membership ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent', cursor: confirmed && membership ? 'pointer' : 'not-allowed' }}>
              {submitting ? (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(239,68,68,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : 'Leave group'}
            </button>
          </div>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
