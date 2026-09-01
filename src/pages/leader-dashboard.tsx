import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import {
  Users, PiggyBank, Shield, Vote,
  AlertTriangle, ChevronRight, Crown, Bell, PlusCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ProgressRing } from '@/components/ui/progress-ring';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { Link } from 'react-router-dom';
import { getValidSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const GROUP_COLORS = ['#2EAF6F', '#2eafaf', '#8B5CF6', '#F59E0B'];
const urgencyColor: Record<string, string> = { high: '#EF4444', medium: '#F59E0B', low: '#2EAF6F' };

interface CommunitySummary {
  id: string;
  name: string;
  currency: 'GBP' | 'NGN';
  status: 'active' | 'closed' | 'suspended';
  memberCount: number;
  contributionRate: number | null;
  missedCount: number;
  openProposalsCount: number;
}

interface PendingAction {
  type: 'contribution' | 'proposal' | 'member';
  label: string;
  community: string;
  time: string;
  urgency: 'high' | 'medium' | 'low';
}

interface MemberSummary {
  id: string;
  label: string;
  community: string;
  trustScore: number;
  contributionRate: number | null;
  status: 'active' | 'attention';
  strikeCount: number;
}

interface LeaderDashboardData {
  isLeader: boolean;
  totals: {
    groupsLed: number;
    totalMembers: number;
    avgContributionRate: number | null;
    avgTrustScore: number | null;
    openProposals: number;
  };
  communities: CommunitySummary[];
  pendingActions: PendingAction[];
  members: MemberSummary[];
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.round(diffDays / 7);
  return `${diffWeeks}w ago`;
}

export default function LeaderDashboardPage() {
  const [data, setData] = useState<LeaderDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view your Manage Group dashboard.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    void window.fetch('/api/groups/leader-dashboard', { headers: { Authorization: 'Bearer ' + session.token } })
      .then(response => response.json().then((json: ApiResponse<LeaderDashboardData>) => ({ ok: response.ok, json })))
      .then(({ ok, json }) => {
        if (cancelled) return;
        if (!ok || !json.data) {
          setError(json.message || 'Could not load your Manage Group dashboard.');
          setLoading(false);
          return;
        }
        setData(json.data);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load your Manage Group dashboard.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Manage Group — PadiHub</title>
        <meta name="description" content="Manage the savings groups you lead — real membership, contribution and governance data on PadiHub." />
        <link rel="canonical" href="https://padihub.com/leader-dashboard" />
        <meta property="og:title" content="Manage Group — PadiHub" />
        <meta property="og:description" content="Manage the savings groups you lead — real membership, contribution and governance data on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {loading && <SkeletonPage />}

        {!loading && error && (
          <div className="rounded-3xl p-8 bg-white text-center" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <AlertTriangle size={24} className="mx-auto mb-3" style={{ color: '#EF4444' }} />
            <h1 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn't load this page</h1>
            <p className="text-sm text-gray-500">{error}</p>
          </div>
        )}

        {/* Only groups the user actually created should ever surface leader
            analytics here — anyone who doesn't lead a group gets a plain
            explanation instead of fabricated dashboard data. */}
        {!loading && !error && data && !data.isLeader && (
          <div className="rounded-3xl p-10 bg-white text-center max-w-xl mx-auto" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <Crown size={28} className="mx-auto mb-4" style={{ color: '#F59E0B' }} />
            <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Manage Group is for group creators</h1>
            <p className="text-sm text-gray-500 mb-6">
              You don't currently lead any savings groups, so there's nothing to manage yet. Create a group to unlock your Manage Group dashboard.
            </p>
            <Link to="/savings-groups/create"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
              <PlusCircle size={15} /> Create your first group
            </Link>
          </div>
        )}

        {!loading && !error && data && data.isLeader && (
          <MotionDiv initial="hidden" animate="visible" variants={stagger}>

            {/* Header */}
            <MotionDiv variants={fadeUp} className="flex items-center justify-between mb-8 flex-wrap gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Crown size={18} style={{ color: '#F59E0B' }} />
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#F59E0B' }}>Leader Dashboard</span>
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Command Centre</h1>
                <p className="text-gray-500 text-sm mt-1">
                  You lead {data.totals.groupsLed} {data.totals.groupsLed === 1 ? 'community' : 'communities'} · {data.totals.totalMembers} member{data.totals.totalMembers === 1 ? '' : 's'} total
                </p>
              </div>
              <Link to="/savings-groups"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
                <PiggyBank size={15} /> Go to My Groups
              </Link>
            </MotionDiv>

            {/* KPI overview — only stats PadiHub actually tracks */}
            <MotionDiv variants={fadeUp} className="r-grid-stats" style={{ marginBottom: 32 }}>
              {[
                {
                  label: 'Total Members', value: String(data.totals.totalMembers), icon: Users, color: '#2EAF6F',
                  ring: data.totals.totalMembers > 0 ? 100 : 0,
                  trend: `${data.totals.groupsLed} group${data.totals.groupsLed === 1 ? '' : 's'} led`,
                },
                {
                  label: 'Avg Contribution Rate', value: data.totals.avgContributionRate === null ? '—' : `${data.totals.avgContributionRate}%`, icon: PiggyBank, color: '#2eafaf',
                  ring: data.totals.avgContributionRate ?? 0,
                  trend: data.totals.avgContributionRate === null ? 'No contributions yet' : 'Paid vs. missed cycles',
                },
                {
                  label: 'Avg Trust Score™', value: data.totals.avgTrustScore === null ? '—' : String(data.totals.avgTrustScore), icon: Shield, color: '#8B5CF6',
                  ring: data.totals.avgTrustScore ?? 0,
                  trend: 'Scale: 0–100',
                },
                {
                  label: 'Open Proposals', value: String(data.totals.openProposals), icon: Vote, color: '#F59E0B',
                  ring: data.totals.openProposals > 0 ? 100 : 0,
                  trend: data.totals.openProposals > 0 ? 'Awaiting member votes' : 'Nothing pending',
                },
              ].map((k, i) => (
                <div key={i} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${k.color}15` }}>
                      <k.icon size={17} style={{ color: k.color }} />
                    </div>
                    <ProgressRing value={k.ring} size={38} strokeWidth={4} color={k.color} />
                  </div>
                  <p className="text-2xl font-black text-gray-900 mb-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                  <p className="text-xs text-gray-500 mb-1">{k.label}</p>
                  <span className="text-xs font-semibold" style={{ color: k.color }}>{k.trend}</span>
                </div>
              ))}
            </MotionDiv>

            <div className="r-grid-3" style={{ marginBottom: 24 }}>

              {/* Pending actions */}
              <MotionDiv variants={fadeUp} className="lg:col-span-2 rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Pending Actions</h2>
                  {data.pendingActions.some(a => a.urgency === 'high') && (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                      {data.pendingActions.filter(a => a.urgency === 'high').length} urgent
                    </span>
                  )}
                </div>
                {data.pendingActions.length === 0 ? (
                  <div className="text-center py-8">
                    <Bell size={20} className="mx-auto mb-2" style={{ color: '#9CA3AF' }} />
                    <p className="text-sm text-gray-400">You're all caught up — no pending actions.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {data.pendingActions.map((a, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-gray-50 transition-colors"
                        style={{ border: '1px solid #F3F4F6' }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: urgencyColor[a.urgency] }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{a.label}</p>
                          <p className="text-xs text-gray-400">{a.community} · {formatRelativeTime(a.time)}</p>
                        </div>
                        <ChevronRight size={15} className="text-gray-300 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </MotionDiv>

              {/* Community health */}
              <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Health</h2>
                <div className="flex flex-col gap-5">
                  {data.communities.map((c, i) => {
                    const color = GROUP_COLORS[i % GROUP_COLORS.length];
                    const health = c.contributionRate ?? 0;
                    return (
                      <div key={c.id}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-black"
                              style={{ background: color }}>{c.name[0]}</div>
                            <div>
                              <p className="text-xs font-bold text-gray-800 leading-tight">{c.name}</p>
                              <p className="text-xs text-gray-400">{c.memberCount} member{c.memberCount === 1 ? '' : 's'}</p>
                            </div>
                          </div>
                          <span className="text-sm font-black" style={{ color, fontFamily: 'Nunito, sans-serif' }}>
                            {c.contributionRate === null ? '—' : `${c.contributionRate}%`}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-gray-100">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${health}%`, background: `linear-gradient(90deg, ${color}, #F59E0B)` }} />
                        </div>
                        <div className="flex gap-3 mt-2">
                          {c.missedCount > 0 && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: '#EF4444' }}>
                              <AlertTriangle size={10} /> {c.missedCount} missed
                            </span>
                          )}
                          {c.openProposalsCount > 0 && (
                            <span className="flex items-center gap-1 text-xs" style={{ color: '#F59E0B' }}>
                              <Vote size={10} /> {c.openProposalsCount} proposal{c.openProposalsCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </MotionDiv>
            </div>

            {/* Member overview */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Member Overview</h2>
                <Link to="/savings-groups" className="text-sm font-semibold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
                  View all <ChevronRight size={14} />
                </Link>
              </div>
              {data.members.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={20} className="mx-auto mb-2" style={{ color: '#9CA3AF' }} />
                  <p className="text-sm text-gray-400">No members yet — invite people to join your groups.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="pb-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Member</th>
                        <th className="pb-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Trust Score™</th>
                        <th className="pb-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Contributions</th>
                        <th className="pb-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.members.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>{m.label.match(/\d+/)?.[0] ?? '•'}</div>
                              <div>
                                <p className="font-semibold text-gray-800">{m.label}</p>
                                <p className="text-xs text-gray-400">{m.community}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 text-right font-bold" style={{ color: '#2EAF6F' }}>{m.trustScore}/100</td>
                          <td className="py-3 text-right font-semibold text-gray-700">{m.contributionRate === null ? '—' : `${m.contributionRate}%`}</td>
                          <td className="py-3 text-right">
                            {m.status === 'active' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>
                                {m.strikeCount} strike{m.strikeCount === 1 ? '' : 's'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </MotionDiv>

          </MotionDiv>
        )}
      </div>
    </DashboardLayout>
  );
}
