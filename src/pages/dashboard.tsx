import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import {
  Shield, Users, Calendar, ArrowRight,
  ChevronRight, Plus, Bell, AlertCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';
import { getTrustTiers, getCurrentTier } from '@/lib/trust-tiers';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const GROUP_COLORS = ['#2EAF6F', '#2eafaf', '#8B5CF6', '#F59E0B', '#EF4444', '#3B82F6'];

interface UserProfile {
  first_name?: string | null;
  display_name?: string | null;
  email?: string | null;
}

interface UserStats {
  trust_score: number;
  trust_score_max: number;
}

interface SavingsGroup {
  id: string;
  name: string;
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: string;
  maximum_members: number;
  status: string;
}

interface Contribution {
  id: string;
  group_id: string;
  amount_due: string | number;
  due_date: string;
  payment_status: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
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

function getDisplayName(profile: UserProfile | null) {
  if (!profile) return '';
  const source = profile.display_name?.trim() || profile.first_name?.trim() || profile.email?.split('@')[0] || '';
  return source.split(' ')[0] || '';
}

function formatCurrency(amount: string | number, currency: string) {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const symbol = currency === 'NGN' ? '₦' : currency === 'GBP' ? '£' : '';
  if (!Number.isFinite(value)) return `${symbol}0`;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
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

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [greeting, setGreeting] = useState('Welcome back');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [groups, setGroups] = useState<SavingsGroup[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const loadDashboard = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view your dashboard.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const [profileRes, statsRes, groupsRes, contribRes, notifRes] = await Promise.all([
        window.fetch('/api/users/profile', { headers }),
        window.fetch('/api/users/stats', { headers }),
        window.fetch('/api/groups', { headers }),
        window.fetch('/api/contributions', { headers }),
        window.fetch('/api/notifications?limit=3', { headers }),
      ]);

      const profileJson = await readJson<UserProfile>(profileRes);
      if (!profileRes.ok) {
        setError(getApiErrorMessage(profileJson, 'We could not load your dashboard right now.'));
        return;
      }
      setProfile(profileJson?.data ?? null);

      const statsJson = await readJson<UserStats>(statsRes);
      if (statsRes.ok) setStats(statsJson?.data ?? null);

      const groupsJson = await readJson<SavingsGroup[]>(groupsRes);
      if (groupsRes.ok) setGroups(groupsJson?.data ?? []);

      const contribJson = await readJson<Contribution[]>(contribRes);
      if (contribRes.ok) setContributions(contribJson?.data ?? []);

      const notifJson = await readJson<Notification[]>(notifRes);
      if (notifRes.ok) setNotifications(notifJson?.data ?? []);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
    void loadDashboard();
  }, [loadDashboard]);

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  const firstName = getDisplayName(profile);
  const trustScore = stats?.trust_score ?? 0;
  const trustScoreMax = stats?.trust_score_max ?? 100;
  const tiers = getTrustTiers(trustScoreMax);
  const currentTier = getCurrentTier(trustScore, tiers);
  const trustPercent = trustScoreMax > 0 ? Math.min(100, Math.max(0, (trustScore / trustScoreMax) * 100)) : 0;

  const dueContribution = contributions
    .filter(item => item.payment_status === 'due' || item.payment_status === 'overdue')
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
  const dueGroup = dueContribution ? groups.find(group => group.id === dueContribution.group_id) : undefined;

  const unreadCount = notifications.filter(item => !item.is_read).length;

  return (
    <DashboardLayout>
      <Helmet>
        <title>Dashboard — PadiHub</title>
        <meta name="description" content="Your PadiHub savings dashboard — groups, payments and Trust Score." />
        <link rel="canonical" href="https://padihub.com/dashboard" />
        <meta property="og:title" content="Dashboard — PadiHub" />
        <meta property="og:description" content="Your PadiHub savings dashboard — groups, payments and Trust Score." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
        {error && (
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#DC2626' }} />
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>
          </div>
        )}

        {/* ── Welcome header ─────────────────────────────────────────── */}
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-gray-500 text-sm font-medium">{greeting}{firstName ? ',' : ''}</p>
              <h1 className="text-2xl sm:text-3xl font-black text-gray-900">{firstName || 'Welcome back'}</h1>
            </div>
            <Link to="/notifications" className="relative w-11 h-11 rounded-2xl bg-white flex items-center justify-center flex-shrink-0" style={{ border: '1px solid #F3F4F6', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
              <Bell className="w-5 h-5 text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </MotionDiv>

          {/* ── Payment due (only shown if something is actually due) ── */}
          {dueContribution && (
            <MotionDiv variants={fadeUp} className="mt-5">
              <Link
                to={`/savings-groups/${dueContribution.group_id}/contribute`}
                className="block rounded-3xl p-6"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #22C55E)', boxShadow: '0 12px 32px rgba(46,175,111,0.25)' }}
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-white/80 text-xs font-bold uppercase tracking-wide">Payment due</p>
                    <p className="text-white text-2xl font-black mt-1">
                      {formatCurrency(dueContribution.amount_due, dueGroup?.currency ?? 'GBP')}
                    </p>
                    <p className="text-white/80 text-sm font-medium mt-1">
                      {dueGroup?.name ?? 'Savings group'} · due {formatDate(dueContribution.due_date)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-bold" style={{ color: '#2EAF6F' }}>
                    Make Payment <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            </MotionDiv>
          )}

          {/* ── Trust Score ──────────────────────────────────────────── */}
          <MotionDiv variants={fadeUp} className="mt-5">
            <Link to="/trust" className="block rounded-3xl bg-white p-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${currentTier.color}18` }}>
                    <Shield className="w-7 h-7" style={{ color: currentTier.color }} />
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs font-bold uppercase tracking-wide">Trust Score™</p>
                    <p className="text-gray-900 text-2xl font-black">{trustScore}<span className="text-gray-400 text-base font-semibold">/{trustScoreMax}</span></p>
                    <p className="text-sm font-semibold" style={{ color: currentTier.color }}>{currentTier.name}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 flex-shrink-0" />
              </div>
              <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${trustPercent}%`, background: currentTier.color }} />
              </div>
            </Link>
          </MotionDiv>

          {/* ── My Groups ────────────────────────────────────────────── */}
          <MotionDiv variants={fadeUp} className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-black text-gray-900">My Groups</h2>
              <Link to="/savings-groups" className="text-sm font-bold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {groups.length === 0 ? (
              <Link
                to="/savings-groups/create"
                className="rounded-3xl bg-white p-8 flex flex-col items-center justify-center text-center gap-3"
                style={{ border: '1px dashed #D1D5DB' }}
              >
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#2EAF6F18' }}>
                  <Plus className="w-6 h-6" style={{ color: '#2EAF6F' }} />
                </div>
                <p className="text-gray-900 font-bold">Create your first savings group</p>
                <p className="text-gray-500 text-sm">You haven't joined or created any groups yet.</p>
              </Link>
            ) : (
              <div className="space-y-3">
                {groups.slice(0, 4).map((group, index) => (
                  <Link
                    key={group.id}
                    to={`/savings-groups/${group.id}`}
                    className="flex items-center gap-4 rounded-2xl bg-white p-4"
                    style={{ border: '1px solid #F3F4F6', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}
                  >
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold"
                      style={{ background: GROUP_COLORS[index % GROUP_COLORS.length] }}
                    >
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 truncate">{group.name}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatCurrency(group.contribution_amount, group.currency)} · {group.contribution_frequency}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </MotionDiv>

          {/* ── Notifications preview ───────────────────────────────── */}
          <MotionDiv variants={fadeUp} className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-black text-gray-900">Notifications</h2>
              <Link to="/notifications" className="text-sm font-bold flex items-center gap-1" style={{ color: '#2EAF6F' }}>
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            </div>

            {notifications.length === 0 ? (
              <div className="rounded-3xl bg-white p-8 flex flex-col items-center justify-center text-center gap-3" style={{ border: '1px solid #F3F4F6' }}>
                <Bell className="w-8 h-8 text-gray-300" />
                <p className="text-gray-500 text-sm">You're all caught up — no notifications yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map(item => (
                  <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-white p-4" style={{ border: '1px solid #F3F4F6' }}>
                    {!item.is_read && <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#2EAF6F' }} />}
                    <div className={item.is_read ? 'flex-1 min-w-0 opacity-70' : 'flex-1 min-w-0'}>
                      <p className="font-semibold text-gray-900 text-sm truncate">{item.title}</p>
                      <p className="text-gray-500 text-sm truncate">{item.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </MotionDiv>

          {/* ── Quick actions ────────────────────────────────────────── */}
          <MotionDiv variants={fadeUp} className="mt-6 grid grid-cols-2 gap-3">
            <Link to="/savings-groups/create">
              <Button className="w-full h-12 rounded-2xl font-bold" style={{ background: '#2EAF6F' }}>
                <Plus className="w-4 h-4 mr-2" /> Create Group
              </Button>
            </Link>
            <Link to="/savings-groups">
              <Button variant="outline" className="w-full h-12 rounded-2xl font-bold">
                <Users className="w-4 h-4 mr-2" /> Browse Groups
              </Button>
            </Link>
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
