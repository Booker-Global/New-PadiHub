import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  PiggyBank,
  Users,
  Shield,
  Calendar,
  CheckCircle,
  Clock,
  TrendingUp,
  Share2,
  UserPlus,
  LogOut,
  AlertTriangle,
  Copy,
  RefreshCw,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

type Tab = 'overview' | 'members' | 'activity' | 'rules';

interface SavingsGroup {
  id: string;
  name: string;
  description?: string | null;
  leader_id: string;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'weekly' | 'monthly';
  maximum_members: number;
  rotation_method: 'manual' | 'random';
  current_rotation_position: number;
  current_cycle: number;
  strike_threshold: number;
  suspension_threshold: number;
  voting_threshold: number;
  allow_payout_swaps: boolean;
  payment_provider: 'stripe' | 'flutterwave';
  status: 'active' | 'closed' | 'suspended';
  created_at: string;
  updated_at: string;
}

interface Membership {
  id: string;
  user_id: string;
  group_id: string;
  role: 'member' | 'leader';
  rotation_order?: number | null;
  status: 'pending' | 'active' | 'suspended' | 'removed';
  strike_count: number;
  join_date: string;
}

interface Contribution {
  id: string;
  group_id: string;
  member_id: string;
  cycle_number: number;
  amount_due: string | number;
  amount_paid?: string | number | null;
  due_date: string;
  paid_date?: string | null;
  payment_status: 'scheduled' | 'due' | 'paid' | 'failed' | 'missed';
}

interface InvitationResult {
  token?: string;
  inviteLink?: string;
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

function formatDate(date: string) {
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return 'Date unavailable';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function shortId(value: string) {
  return `${value.slice(0, 8)}…`;
}

function getGroupColor(group: SavingsGroup) {
  if (group.status === 'closed') return '#6B7280';
  if (group.status === 'suspended') return '#F59E0B';
  return group.currency === 'NGN' ? '#2EAF6F' : '#2eafaf';
}

function getContributionMeta(status: Contribution['payment_status']) {
  switch (status) {
    case 'paid':
      return { color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)', icon: CheckCircle, label: 'Paid' };
    case 'failed':
    case 'missed':
      return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)', icon: AlertTriangle, label: titleCase(status) };
    case 'due':
      return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', icon: Clock, label: 'Due' };
    default:
      return { color: '#2eafaf', bg: 'rgba(46,175,175,0.1)', icon: Calendar, label: 'Scheduled' };
  }
}

function getMembershipBadge(status: Membership['status']) {
  switch (status) {
    case 'active':
      return { color: '#2EAF6F', bg: 'rgba(46,175,111,0.1)' };
    case 'suspended':
      return { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)' };
    case 'removed':
      return { color: '#EF4444', bg: 'rgba(239,68,68,0.1)' };
    default:
      return { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' };
  }
}

export default function SavingsGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('overview');
  const [group, setGroup] = useState<SavingsGroup | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteNotice, setInviteNotice] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [inviteToken, setInviteToken] = useState('');

  const loadData = useCallback(async () => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view this savings group.');
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
          setMemberships([]);
          setContributions([]);
          return;
        }
        throw new Error(message);
      }

      const groupData = groupJson.data ?? null;
      setGroup(groupData);

      const [membershipsResult, contributionsResult] = await Promise.allSettled([
        window.fetch(`/api/memberships?group_id=${id}`, { headers }),
        window.fetch(`/api/contributions?group_id=${id}`, { headers }),
      ]);

      if (membershipsResult.status === 'fulfilled' && membershipsResult.value.ok) {
        const membershipsJson = await membershipsResult.value.json() as ApiResponse<Membership[]>;
        setMemberships(Array.isArray(membershipsJson.data) ? membershipsJson.data : []);
      } else {
        setMemberships([]);
      }

      if (contributionsResult.status === 'fulfilled' && contributionsResult.value.ok) {
        const contributionsJson = await contributionsResult.value.json() as ApiResponse<Contribution[]>;
        const rows = Array.isArray(contributionsJson.data) ? contributionsJson.data : [];
        setContributions(
          rows.sort((left, right) => {
            const leftDate = new Date(left.paid_date || left.due_date).getTime();
            const rightDate = new Date(right.paid_date || right.due_date).getTime();
            return rightDate - leftDate;
          }),
        );
      } else {
        setContributions([]);
      }
    } catch (loadError) {
      setGroup(null);
      setMemberships([]);
      setContributions([]);
      setError(loadError instanceof Error ? loadError.message : 'Could not load this group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const session = getValidSession();
  const currentUserId = session?.userId;

  const activeMembers = useMemo(
    () => memberships.filter(member => member.status === 'active'),
    [memberships],
  );

  const membershipSummary = useMemo(() => ({
    active: memberships.filter(member => member.status === 'active').length,
    pending: memberships.filter(member => member.status === 'pending').length,
    suspended: memberships.filter(member => member.status === 'suspended').length,
    removed: memberships.filter(member => member.status === 'removed').length,
  }), [memberships]);

  const orderedMembers = useMemo(
    () => [...memberships].sort((left, right) => {
      const leftRole = left.role === 'leader' ? 0 : 1;
      const rightRole = right.role === 'leader' ? 0 : 1;
      if (leftRole !== rightRole) return leftRole - rightRole;
      return (left.rotation_order ?? Number.MAX_SAFE_INTEGER) - (right.rotation_order ?? Number.MAX_SAFE_INTEGER);
    }),
    [memberships],
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'members', label: 'Members' },
    { key: 'activity', label: 'Activity' },
    { key: 'rules', label: 'Rules' },
  ];

  const groupColor = group ? getGroupColor(group) : '#2EAF6F';
  const occupancyPercentage = group ? Math.min(100, Math.round((activeMembers.length / Math.max(group.maximum_members, 1)) * 100)) : 0;

  const closeInviteModal = () => {
    setInviteOpen(false);
    setInviteLoading(false);
    setInviteError('');
    setInviteNotice('');
    setInviteEmail('');
    setInviteLink('');
    setInviteToken('');
  };

  const openInviteModal = () => {
    setInviteOpen(true);
    setInviteError('');
    setInviteNotice('');
  };

  const handleCreateInvite = async () => {
    if (!group) return;

    const activeSession = getValidSession();
    if (!activeSession?.token) {
      setInviteError('Please log in to send invites.');
      return;
    }

    setInviteLoading(true);
    setInviteError('');
    setInviteNotice('');

    try {
      const response = await window.fetch(`/api/groups/${group.id}/invitations`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + activeSession.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: inviteEmail.trim() || undefined }),
      });

      const json = await response.json() as ApiResponse<InvitationResult>;
      if (!response.ok) {
        setInviteError(getErrorMessage(json, 'Could not create an invite right now.'));
        return;
      }

      const returnedInviteLink = json.data?.inviteLink || '';
      const returnedToken = json.data?.token || '';
      const queryToken = returnedInviteLink ? new window.URLSearchParams(returnedInviteLink.split('?')[1] || '').get('token') || '' : '';
      const effectiveToken = returnedToken || queryToken;
      const sharePath = effectiveToken
        ? `/savings-groups/${group.id}/join?invite_token=${effectiveToken}`
        : returnedInviteLink;
      const fullLink = sharePath ? new window.URL(sharePath, window.location.origin).toString() : '';

      setInviteToken(effectiveToken);
      setInviteLink(fullLink);
      setInviteNotice(inviteEmail.trim() ? `Invite created for ${inviteEmail.trim()}.` : 'Invite link created successfully.');
    } catch {
      setInviteError('Network error. Please check your connection and try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;

    try {
      await window.navigator.clipboard.writeText(inviteLink);
      setInviteNotice('Invite link copied.');
      setInviteError('');
    } catch {
      setInviteError('Could not copy the invite link. Please copy it manually.');
    }
  };

  if (loading) {
    return <DashboardLayout><SkeletonPage /></DashboardLayout>;
  }

  if (notFound) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-2xl mx-auto text-center py-16">
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Group not found</h1>
          <p className="text-gray-500 mb-6">The savings group you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
          <Link to="/savings-groups" className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            <ChevronLeft size={16} /> Back to savings groups
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !group) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-2xl mx-auto text-center py-16">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle size={24} style={{ color: '#EF4444' }} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Couldn&apos;t load this group</h1>
          <p className="text-gray-500 mb-6">{error || 'Could not load this group.'}</p>
          <button onClick={() => void loadData()} className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
            <RefreshCw size={16} /> Try again
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>{group.name} — PadiHub</title>
        <meta name="description" content={group.description || `Manage ${group.name} on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${group.id}`} />
        <meta property="og:title" content={`${group.name} — PadiHub`} />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://padihub.com/savings-groups/${group.id}`} />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="mb-4">
            <Link to="/savings-groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back to my groups
            </Link>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: groupColor }} />
            <div className="relative">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-3xl flex items-center justify-center flex-shrink-0" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)`, boxShadow: `0 4px 20px ${groupColor}40` }}>
                    <PiggyBank size={24} color="#fff" />
                  </div>
                  <div>
                    <h1 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {titleCase(group.status)} · {group.currency} · Created {formatDate(group.created_at)}
                    </p>
                  </div>
                </div>
                <Link to={`/savings-groups/${group.id}/contribute`} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
                  <PiggyBank size={14} /> Make Payment
                </Link>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Contribution', value: formatCurrency(group.contribution_amount, group.currency), color: groupColor },
                  { label: 'Frequency', value: titleCase(group.contribution_frequency), color: '#2eafaf' },
                  { label: 'Active members', value: `${activeMembers.length}/${group.maximum_members}`, color: '#8B5CF6' },
                  { label: 'Current cycle', value: group.current_cycle.toString(), color: '#F59E0B' },
                ].map(stat => (
                  <div key={stat.label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-lg font-black" style={{ color: stat.color, fontFamily: 'Nunito, sans-serif' }}>{stat.value}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex justify-between text-xs mb-2">
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>Group occupancy</span>
                  <span className="font-bold" style={{ color: groupColor }}>{occupancyPercentage}% full</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${occupancyPercentage}%`, background: `linear-gradient(90deg, ${groupColor}, #F59E0B)` }} />
                </div>
                <div className="flex items-center justify-between mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  <span>Rotation method: {titleCase(group.rotation_method)}</span>
                  <span>Position {group.current_rotation_position}</span>
                </div>
              </div>

              <div className="flex gap-2 mt-4 flex-wrap">
                <button onClick={openInviteModal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
                  <UserPlus size={12} /> Invite
                </button>
                <button onClick={openInviteModal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
                  <Share2 size={12} /> Share
                </button>
                <Link to={`/savings-groups/${group.id}/leave`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.75)' }}>
                  <LogOut size={12} /> Leave
                </Link>
              </div>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: '#F3F4F6' }}>
            {tabs.map(currentTab => (
              <button
                key={currentTab.key}
                onClick={() => setTab(currentTab.key)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: tab === currentTab.key ? '#fff' : 'transparent',
                  color: tab === currentTab.key ? '#1A1A2E' : '#6B7280',
                  boxShadow: tab === currentTab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {currentTab.label}
              </button>
            ))}
          </MotionDiv>

          <AnimatePresence mode="wait">
            <MotionDiv key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              {tab === 'overview' && (
                <div className="flex flex-col gap-5">
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Group Details</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { label: 'Description', value: group.description || 'No description added yet.' },
                        { label: 'Leader', value: group.leader_id === currentUserId ? 'You' : shortId(group.leader_id) },
                        { label: 'Country', value: group.country === 'NG' ? 'Nigeria' : 'United Kingdom' },
                        { label: 'Payment provider', value: titleCase(group.payment_provider) },
                        { label: 'Created', value: formatDate(group.created_at) },
                        { label: 'Last updated', value: formatDate(group.updated_at) },
                      ].map(row => (
                        <div key={row.label} className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                          <p className="text-xs text-gray-400 mb-1">{row.label}</p>
                          <p className="text-sm font-semibold text-gray-800 break-words">{row.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Membership Summary</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      {[
                        { label: 'Active', value: membershipSummary.active.toString(), color: '#2EAF6F' },
                        { label: 'Pending', value: membershipSummary.pending.toString(), color: '#2eafaf' },
                        { label: 'Suspended', value: membershipSummary.suspended.toString(), color: '#F59E0B' },
                        { label: 'Removed', value: membershipSummary.removed.toString(), color: '#EF4444' },
                      ].map(summary => (
                        <div key={summary.label} className="rounded-2xl p-4 text-center" style={{ background: '#F9FAFB' }}>
                          <p className="text-2xl font-black mb-0.5" style={{ color: summary.color, fontFamily: 'Nunito, sans-serif' }}>{summary.value}</p>
                          <p className="text-xs text-gray-400">{summary.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                        <p className="text-xs text-gray-400 mb-1">Current cycle</p>
                        <p className="text-lg font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.current_cycle}</p>
                      </div>
                      <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,175,0.06)', border: '1px solid rgba(46,175,175,0.15)' }}>
                        <p className="text-xs text-gray-400 mb-1">Current rotation position</p>
                        <p className="text-lg font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.current_rotation_position}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === 'members' && (
                orderedMembers.length === 0 ? (
                  <div className="rounded-3xl p-6 bg-white text-center" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <Users size={24} className="mx-auto mb-3" style={{ color: '#9CA3AF' }} />
                    <h2 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No member records yet</h2>
                    <p className="text-sm text-gray-500">Members will appear here once the group has active memberships.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {orderedMembers.map((member, index) => {
                      const badge = getMembershipBadge(member.status);
                      const displayName = member.user_id === currentUserId ? 'You' : `Member ${index + 1}`;

                      return (
                        <div key={member.id} className="rounded-2xl p-4 bg-white flex items-center gap-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                          <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0" style={{ background: `linear-gradient(135deg, ${groupColor}, ${groupColor}cc)` }}>
                            {displayName[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-gray-900 text-sm">{displayName}</p>
                              {member.role === 'leader' && <CheckCircle size={13} style={{ color: '#2EAF6F' }} />}
                            </div>
                            <p className="text-xs text-gray-400 break-all">
                              {titleCase(member.role)} · Position {member.rotation_order ?? '—'} · {shortId(member.user_id)}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: badge.bg, color: badge.color }}>
                              {titleCase(member.status)}
                            </span>
                            <p className="text-xs text-gray-400 mt-1">{member.strike_count} strike{member.strike_count === 1 ? '' : 's'}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {tab === 'activity' && (
                contributions.length === 0 ? (
                  <div className="rounded-3xl p-6 bg-white text-center" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <TrendingUp size={24} className="mx-auto mb-3" style={{ color: '#9CA3AF' }} />
                    <h2 className="text-lg font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>No contribution activity yet</h2>
                    <p className="text-sm text-gray-500">Once contribution schedules or payments exist for this group, they&apos;ll appear here.</p>
                  </div>
                ) : (
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Contribution Activity</h2>
                    <div className="flex flex-col">
                      {contributions.map((entry, index) => {
                        const meta = getContributionMeta(entry.payment_status);
                        const Icon = meta.icon;
                        const activityDate = entry.paid_date || entry.due_date;
                        const amount = entry.payment_status === 'paid' && entry.amount_paid ? entry.amount_paid : entry.amount_due;

                        return (
                          <div key={entry.id} className="flex items-start gap-4 relative">
                            {index < contributions.length - 1 && <div className="absolute left-5 top-10 bottom-0 w-0.5" style={{ background: '#F3F4F6' }} />}
                            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-white" style={{ border: `2px solid ${meta.color}30` }}>
                              <Icon size={15} style={{ color: meta.color }} />
                            </div>
                            <div className="flex-1 pb-5">
                              <div className="flex items-center justify-between gap-4">
                                <div>
                                  <p className="text-sm font-semibold text-gray-800">Cycle {entry.cycle_number} · {meta.label}</p>
                                  <p className="text-xs text-gray-400 break-all">Member {shortId(entry.member_id)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold" style={{ color: meta.color }}>{formatCurrency(amount, group.currency)}</p>
                                  <span className="text-xs text-gray-400">{formatDate(activityDate)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}

              {tab === 'rules' && (
                <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Group Rules</h2>
                  <div className="flex flex-col gap-4">
                    {[
                      { icon: AlertTriangle, color: '#EF4444', label: 'Strike threshold', value: `${group.strike_threshold} missed payment${group.strike_threshold === 1 ? '' : 's'} before warning` },
                      { icon: Clock, color: '#F59E0B', label: 'Suspension threshold', value: `${group.suspension_threshold} missed payment${group.suspension_threshold === 1 ? '' : 's'} before suspension` },
                      { icon: Users, color: '#8B5CF6', label: 'Voting threshold', value: `${group.voting_threshold}% approval required` },
                      { icon: TrendingUp, color: '#2EAF6F', label: 'Payout swaps', value: group.allow_payout_swaps ? 'Allowed' : 'Not allowed' },
                      { icon: Shield, color: '#2eafaf', label: 'Rotation method', value: titleCase(group.rotation_method) },
                    ].map(rule => (
                      <div key={rule.label} className="flex items-start gap-4 p-4 rounded-2xl" style={{ background: '#F9FAFB' }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${rule.color}15` }}>
                          <rule.icon size={18} style={{ color: rule.color }} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">{rule.label}</p>
                          <p className="text-sm font-semibold text-gray-800">{rule.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </MotionDiv>
          </AnimatePresence>
        </MotionDiv>
      </div>

      <AnimatePresence>
        {inviteOpen && (
          <>
            <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={closeInviteModal} />
            <MotionDiv initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ type: 'spring', stiffness: 350, damping: 28 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="bg-white rounded-3xl shadow-2xl p-7 w-full max-w-md pointer-events-auto relative">
                <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Invite members</h2>
                <p className="text-sm text-gray-500 mb-5">Enter an email to send a direct invite, or leave it blank to create a shareable link.</p>

                {inviteError && (
                  <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', marginBottom: 16 }}>
                    {inviteError}
                  </div>
                )}

                {inviteNotice && (
                  <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0', marginBottom: 16 }}>
                    {inviteNotice}
                  </div>
                )}

                <label className="block text-sm font-bold text-gray-700 mb-1.5">Email address <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={inviteEmail} onChange={event => setInviteEmail(event.target.value)} placeholder="name@example.com" type="email" className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors mb-4" />

                {inviteLink && (
                  <div className="rounded-2xl p-4 mb-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                    <p className="text-xs text-gray-400 mb-2">Shareable link</p>
                    <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 text-xs text-gray-600 break-all mb-3">{inviteLink}</div>
                    {inviteToken && <p className="text-xs text-gray-400 mb-3">Invite token: <span className="font-semibold text-gray-600">{inviteToken}</span></p>}
                    <Button onClick={() => void handleCopyLink()} variant="outline" className="w-full rounded-2xl font-semibold gap-2">
                      <Copy size={14} /> Copy link
                    </Button>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={closeInviteModal} className="flex-1 rounded-2xl font-semibold">Close</Button>
                  <Button onClick={() => void handleCreateInvite()} disabled={inviteLoading} className="flex-1 rounded-2xl font-bold" style={{ background: '#2EAF6F', color: '#fff' }}>
                    {inviteLoading ? 'Sending…' : inviteEmail.trim() ? 'Send invite' : 'Create link'}
                  </Button>
                </div>
              </div>
            </MotionDiv>
          </>
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
