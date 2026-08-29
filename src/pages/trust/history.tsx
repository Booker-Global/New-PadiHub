import { useCallback, useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';

import { MotionDiv, MotionProgressBar } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import { ChevronLeft, CheckCircle, Users, TrendingDown, TrendingUp, AlertCircle, Shield } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

interface TrustHistoryItem {
  id: string;
  reason: string;
  delta: number;
  new_score: number | null;
  created_at: string;
}

interface CommunityTrust {
  group_id: string;
  group_name: string;
  average_trust_score: number | null;
  member_count: number;
}

interface UserStats {
  trust_score: number;
  contribution_reliability: number | null;
  governance_participation: number | null;
  identity_verified: boolean;
  community_trust: CommunityTrust[];
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

const REASON_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  CONTRIBUTION_PAID:    { label: 'Contribution paid on time', color: '#2EAF6F', icon: CheckCircle },
  CONTRIBUTION_MISSED:  { label: 'Contribution missed',       color: '#EF4444', icon: TrendingDown },
  CYCLE_COMPLETED:      { label: 'Savings cycle completed',   color: '#8B5CF6', icon: Users },
  IDENTITY_VERIFIED:    { label: 'Identity verified',         color: '#2EAF6F', icon: Shield },
  MEMBER_SUSPENDED:     { label: 'Suspended from a group',    color: '#EF4444', icon: TrendingDown },
};

function describeReason(reason: string) {
  return REASON_LABELS[reason] ?? { label: reason.replace(/_/g, ' ').toLowerCase(), color: '#6B7280', icon: TrendingUp };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

async function readJson<T>(response: { json(): Promise<unknown> }): Promise<ApiResponse<T> | null> {
  try {
    return await response.json() as ApiResponse<T>;
  } catch {
    return null;
  }
}

export default function TrustHistoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<TrustHistoryItem[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);

  const loadData = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view your Trust Score™ history.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const [historyRes, statsRes] = await Promise.all([
        window.fetch('/api/users/trust-history', { headers }),
        window.fetch('/api/users/stats', { headers }),
      ]);

      const historyJson = await readJson<TrustHistoryItem[]>(historyRes);
      if (!historyRes.ok) {
        setError(getApiErrorMessage(historyJson, 'We could not load your Trust Score™ history right now.'));
        return;
      }
      setHistory(historyJson?.data ?? []);

      const statsJson = await readJson<UserStats>(statsRes);
      if (statsRes.ok) setStats(statsJson?.data ?? null);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  const insights = stats ? [
    ...(stats.contribution_reliability !== null ? [{ label: 'Contribution Reliability', value: stats.contribution_reliability, color: '#2EAF6F', desc: 'On-time contributions' }] : []),
    ...(stats.governance_participation !== null ? [{ label: 'Governance Participation', value: stats.governance_participation, color: '#8B5CF6', desc: 'Votes submitted' }] : []),
    { label: 'Verification', value: stats.identity_verified ? 100 : 0, color: '#2EAF6F', desc: stats.identity_verified ? 'Profile verified' : 'Not yet verified' },
  ] : [];

  return (
    <DashboardLayout>
      <Helmet>
        <title>Trust History & Insights — PadiHub</title>
        <meta name="description" content="View your Trust Score™ history, insights and community trust on PadiHub." />
        <link rel="canonical" href="https://padihub.com/trust/history" />
              <meta property="og:title" content="Trust History & Insights — PadiHub" />
        <meta property="og:description" content="View your Trust Score™ history, insights and community trust on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/trust" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust History & Insights</h1>
              <p className="text-gray-500 text-sm">Your reputation journey across all communities.</p>
            </div>
          </MotionDiv>

          {error && (
            <MotionDiv variants={fadeUp} className="rounded-2xl p-4 flex items-start gap-3 mb-6" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#DC2626' }} />
              <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>
            </MotionDiv>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* History timeline */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Activity</h2>
              {history.length === 0 ? (
                <p className="text-sm text-gray-500">No Trust Score™ activity yet — it will show up here as you contribute and participate.</p>
              ) : (
                <div className="flex flex-col gap-0">
                  {history.map((h, i) => {
                    const meta = describeReason(h.reason);
                    return (
                      <div key={h.id} className="flex items-start gap-3 relative">
                        {i < history.length - 1 && (
                          <div className="absolute left-4 top-9 bottom-0 w-0.5" style={{ background: '#F3F4F6' }} />
                        )}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-white"
                          style={{ border: `1px solid ${meta.color}25` }}>
                          <meta.icon size={13} style={{ color: meta.color }} />
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="text-sm font-semibold text-gray-800">{meta.label}</p>
                          <p className="text-xs text-gray-400">{formatDate(h.created_at)}</p>
                        </div>
                        <span className="text-xs font-black flex-shrink-0 mt-0.5" style={{ color: h.delta >= 0 ? '#2EAF6F' : '#EF4444' }}>
                          {h.delta >= 0 ? '+' : ''}{h.delta}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </MotionDiv>

            {/* Insights */}
            <div className="flex flex-col gap-5">
              <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Insights</h2>
                {insights.length === 0 ? (
                  <p className="text-sm text-gray-500">Not enough activity yet to show insights.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {insights.map(ins => (
                      <div key={ins.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-gray-700">{ins.label}</span>
                          <span className="font-black" style={{ color: ins.color }}>{ins.value}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <MotionProgressBar className="h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${ins.value}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' as const }}
                            style={{ background: `linear-gradient(90deg, ${ins.color}, ${ins.color}cc)` }} />
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">{ins.desc}</p>
                      </div>
                    ))}
                  </div>
                )}
              </MotionDiv>

              {/* Community trust */}
              <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Trust View</h2>
                {!stats || stats.community_trust.length === 0 ? (
                  <p className="text-sm text-gray-500">Join a savings group to see how your Trust Score™ compares.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {stats.community_trust.map(c => (
                      <div key={c.group_id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#2EAF6F15' }}>
                          <Users size={13} style={{ color: '#2EAF6F' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{c.group_name}</p>
                          <p className="text-xs text-gray-400">{c.member_count} member{c.member_count === 1 ? '' : 's'}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-base font-black" style={{ color: '#2EAF6F', fontFamily: 'Nunito, sans-serif' }}>
                            {c.average_trust_score ?? '—'}
                          </p>
                          <p className="text-xs text-gray-400">avg trust</p>
                        </div>
                        {stats && c.average_trust_score !== null && stats.trust_score > c.average_trust_score && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                            Above average
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </MotionDiv>
            </div>
          </div>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
