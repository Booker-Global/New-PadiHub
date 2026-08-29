import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { MotionDiv } from '@/lib/motion-safe';
import {
  PiggyBank,
  Plus,
  Calendar,
  TrendingUp,
  CheckCircle,
  Clock,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

interface SavingsGroup {
  id: string;
  name: string;
  description?: string | null;
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'weekly' | 'monthly';
  maximum_members: number;
  status: 'active' | 'closed' | 'suspended';
  created_at: string;
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
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[] | undefined>;
}

const GROUP_COLORS = ['#2EAF6F', '#2eafaf', '#8B5CF6', '#F59E0B'];

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

function getTimelineMeta(status: Contribution['payment_status']) {
  switch (status) {
    case 'paid':
      return { label: 'Paid', color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)', icon: CheckCircle };
    case 'failed':
    case 'missed':
      return { label: titleCase(status), color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle };
    case 'due':
      return { label: 'Due', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock };
    default:
      return { label: 'Scheduled', color: '#2eafaf', bg: 'rgba(46,175,175,0.1)', icon: Calendar };
  }
}

export default function SavingsGroupsPage() {
  const [tab, setTab] = useState<'groups' | 'timeline'>('groups');
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [timeline, setTimeline] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setGroups([]);
      setTimeline([]);
      setError('Please log in to view your savings groups.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const [groupsResponse, contributionsResponse] = await Promise.all([
        window.fetch('/api/groups', { headers }),
        window.fetch('/api/contributions', { headers }),
      ]);

      const groupsJson = await groupsResponse.json() as ApiResponse<SavingsGroup[]>;
      if (!groupsResponse.ok) {
        throw new Error(getErrorMessage(groupsJson, 'Could not load savings groups.'));
      }

      const groupRows = Array.isArray(groupsJson.data) ? groupsJson.data : [];
      setGroups(groupRows);

      if (contributionsResponse.ok) {
        const contributionsJson = await contributionsResponse.json() as ApiResponse<Contribution[]>;
        const contributionRows = Array.isArray(contributionsJson.data) ? contributionsJson.data : [];
        setTimeline(
          contributionRows.sort((left, right) => {
            const leftDate = new Date(left.paid_date || left.due_date).getTime();
            const rightDate = new Date(right.paid_date || right.due_date).getTime();
            return rightDate - leftDate;
          }),
        );
      } else {
        setTimeline([]);
      }
    } catch (loadError) {
      setGroups([]);
      setTimeline([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load savings groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const summaryStats = useMemo(() => {
    const activeGroups = groups.filter(group => group.status === 'active').length;
    const weeklyGroups = groups.filter(group => group.contribution_frequency === 'weekly').length;
    const monthlyGroups = groups.filter(group => group.contribution_frequency === 'monthly').length;
    const totalCapacity = groups.reduce((sum, group) => sum + group.maximum_members, 0);

    return [
      { label: 'Total Groups', value: groups.length.toString(), color: '#2EAF6F', icon: PiggyBank },
      { label: 'Active Groups', value: activeGroups.toString(), color: '#2eafaf', icon: TrendingUp },
      { label: 'Weekly Groups', value: weeklyGroups.toString(), color: '#F59E0B', icon: Calendar },
      { label: 'Total Capacity', value: totalCapacity.toString(), color: '#8B5CF6', icon: CheckCircle },
      { label: 'Monthly Groups', value: monthlyGroups.toString(), color: '#2EAF6F', icon: Clock },
    ];
  }, [groups]);

  const groupNameById = useMemo(
    () => Object.fromEntries(groups.map(group => [group.id, group.name])),
    [groups],
  );

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Savings Groups — PadiHub</title>
        <meta name="description" content="Track your savings groups, contributions and milestones on PadiHub." />
        <link rel="canonical" href="https://padihub.com/savings-groups" />
        <meta property="og:title" content="Savings Groups — PadiHub" />
        <meta property="og:description" content="Track your savings groups, contributions and milestones on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Savings Groups</h1>
              <p className="text-gray-500 text-sm mt-1">Track your real groups, contributions and milestones</p>
            </div>
            <Link
              to="/savings-groups/create"
              className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}
            >
              <Plus size={16} /> Create group
            </Link>
          </MotionDiv>

          {error ? (
            <MotionDiv variants={fadeUp} className="rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertTriangle size={24} style={{ color: '#EF4444' }} />
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load savings groups</h2>
              <p className="text-sm text-gray-500 mb-5">{error}</p>
              <button
                onClick={() => void loadData()}
                className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
              >
                Try again
              </button>
            </MotionDiv>
          ) : (
            <>
              <MotionDiv variants={fadeUp} className="r-grid-stats" style={{ marginBottom: 24 }}>
                {summaryStats.slice(0, 4).map(stat => (
                  <div key={stat.label} className="rounded-2xl p-4 bg-white flex items-center gap-3" style={{ border: '1px solid #F3F4F6' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${stat.color}15` }}>
                      <stat.icon size={18} style={{ color: stat.color }} />
                    </div>
                    <div>
                      <p className="text-xl font-black" style={{ color: stat.color, fontFamily: 'Nunito, sans-serif' }}>{stat.value}</p>
                      <p className="text-xs text-gray-500">{stat.label}</p>
                    </div>
                  </div>
                ))}
              </MotionDiv>

              <MotionDiv variants={fadeUp} className="flex items-center gap-1 p-1 rounded-2xl bg-gray-100 w-fit mb-6">
                {(['groups', 'timeline'] as const).map(currentTab => (
                  <button
                    key={currentTab}
                    onClick={() => setTab(currentTab)}
                    className="px-5 py-2 rounded-xl text-sm font-bold capitalize transition-all"
                    style={{
                      background: tab === currentTab ? '#fff' : 'transparent',
                      color: tab === currentTab ? '#1A1A2E' : '#6B7280',
                      boxShadow: tab === currentTab ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >
                    {currentTab === 'groups' ? 'My Groups' : 'Timeline'}
                  </button>
                ))}
              </MotionDiv>

              {tab === 'groups' && (
                groups.length === 0 ? (
                  <MotionDiv variants={fadeUp} className="rounded-3xl bg-white p-8 text-center" style={{ border: '1px solid #F3F4F6' }}>
                    <div className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(46,175,111,0.08)' }}>
                      <PiggyBank size={28} style={{ color: '#2EAF6F' }} />
                    </div>
                    <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No savings groups yet</h2>
                    <p className="text-sm text-gray-500 mb-6">You haven&apos;t joined or created any groups yet.</p>
                    <Link
                      to="/savings-groups/create"
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                    >
                      <Plus size={16} /> Create your first group
                    </Link>
                  </MotionDiv>
                ) : (
                  <MotionDiv initial="hidden" animate="visible" variants={stagger} className="r-grid-2">
                    {groups.map((group, index) => {
                      const color = GROUP_COLORS[index % GROUP_COLORS.length];
                      const statusColor = group.status === 'active' ? '#2EAF6F' : group.status === 'suspended' ? '#F59E0B' : '#6B7280';

                      return (
                        <MotionDiv
                          key={group.id}
                          variants={fadeUp}
                          className="rounded-3xl p-6 bg-white group hover:-translate-y-1 transition-transform duration-300"
                          style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}
                        >
                          <div className="flex items-start justify-between mb-4 gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
                                <PiggyBank size={20} style={{ color }} />
                              </div>
                              <div className="min-w-0">
                                <h3 className="font-extrabold text-gray-900 text-sm truncate" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</h3>
                                <p className="text-xs text-gray-400">
                                  {titleCase(group.contribution_frequency)} · up to {group.maximum_members} members
                                </p>
                              </div>
                            </div>
                            <span className="px-2 py-1 rounded-full text-xs font-bold" style={{ background: `${statusColor}15`, color: statusColor }}>
                              {titleCase(group.status)}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mb-5">
                            <div className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                              <p className="text-xs text-gray-400 mb-1">Contribution</p>
                              <p className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
                                {formatCurrency(group.contribution_amount, group.currency)}
                              </p>
                            </div>
                            <div className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                              <p className="text-xs text-gray-400 mb-1">Currency</p>
                              <p className="font-semibold text-gray-800">{group.currency}</p>
                            </div>
                            <div className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                              <p className="text-xs text-gray-400 mb-1">Frequency</p>
                              <p className="font-semibold text-gray-800 capitalize">{group.contribution_frequency}</p>
                            </div>
                            <div className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                              <p className="text-xs text-gray-400 mb-1">Created</p>
                              <p className="font-semibold text-gray-800">{formatDate(group.created_at)}</p>
                            </div>
                          </div>

                          <Link
                            to={`/savings-groups/${group.id}`}
                            className="w-full py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                            style={{ background: `${color}10`, color }}
                          >
                            <ChevronRight size={14} /> View group details
                          </Link>
                        </MotionDiv>
                      );
                    })}
                  </MotionDiv>
                )
              )}

              {tab === 'timeline' && (
                timeline.length === 0 ? (
                  <MotionDiv variants={fadeUp} className="max-w-2xl rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
                    <Clock size={24} className="mx-auto mb-3" style={{ color: '#9CA3AF' }} />
                    <h2 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No contribution activity yet</h2>
                    <p className="text-sm text-gray-500">Contribution activity will appear here once your schedules and payments are available.</p>
                  </MotionDiv>
                ) : (
                  <MotionDiv initial="hidden" animate="visible" variants={stagger} className="max-w-2xl">
                    {timeline.map((entry, index) => {
                      const meta = getTimelineMeta(entry.payment_status);
                      const Icon = meta.icon;
                      const dateLabel = formatDate(entry.paid_date || entry.due_date);
                      const amount = entry.payment_status === 'paid' && entry.amount_paid
                        ? entry.amount_paid
                        : entry.amount_due;

                      return (
                        <MotionDiv key={entry.id} variants={fadeUp} className="flex gap-4 mb-4">
                          <div className="flex flex-col items-center">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: meta.bg }}>
                              <Icon size={18} style={{ color: meta.color }} />
                            </div>
                            {index < timeline.length - 1 && <div className="w-0.5 flex-1 mt-2" style={{ background: '#E5E7EB' }} />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="rounded-2xl p-4 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="font-bold text-sm text-gray-900">{groupNameById[entry.group_id] || 'Savings group'}</p>
                                  <p className="text-xs text-gray-400">{dateLabel} · Cycle {entry.cycle_number}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-black text-base" style={{ fontFamily: 'Nunito, sans-serif', color: meta.color }}>
                                    {formatCurrency(amount, groups.find(group => group.id === entry.group_id)?.currency || 'GBP')}
                                  </p>
                                  <span className="text-xs font-semibold" style={{ color: meta.color }}>
                                    {meta.label}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </MotionDiv>
                      );
                    })}
                  </MotionDiv>
                )
              )}
            </>
          )}
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
