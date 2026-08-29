import { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Bell, Shield, Users, TrendingUp, Globe,
  Settings, X, AlertCircle, CreditCard, Vote, UserCircle, AlertTriangle,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

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

/** Maps every real notification `type` created by the backend into an honest, generic category. */
const TYPE_META: Record<string, { color: string; icon: typeof Bell; category: string }> = {
  contribution_paid:              { color: '#2EAF6F', icon: CreditCard,  category: 'Payments' },
  contribution_missed:            { color: '#EF4444', icon: CreditCard,  category: 'Payments' },
  contribution_failed:            { color: '#EF4444', icon: CreditCard,  category: 'Payments' },
  contribution_reminder:          { color: '#F59E0B', icon: CreditCard,  category: 'Payments' },
  payment_retry_reminder:         { color: '#F59E0B', icon: CreditCard,  category: 'Payments' },
  payout_complete:                { color: '#2EAF6F', icon: CreditCard,  category: 'Payments' },
  payout_completed:               { color: '#2EAF6F', icon: CreditCard,  category: 'Payments' },
  upcoming_payout:                { color: '#2eafaf', icon: CreditCard,  category: 'Payments' },
  subscription_past_due:          { color: '#EF4444', icon: CreditCard,  category: 'Payments' },
  subscription_payment_failed:    { color: '#EF4444', icon: CreditCard,  category: 'Payments' },
  group_created:                  { color: '#2EAF6F', icon: Users,       category: 'Groups' },
  group_closed:                   { color: '#6B7280', icon: Users,       category: 'Groups' },
  joined_group:                   { color: '#2EAF6F', icon: Users,       category: 'Groups' },
  removed_from_group:             { color: '#EF4444', icon: Users,       category: 'Groups' },
  membership_suspended:           { color: '#EF4444', icon: AlertTriangle, category: 'Groups' },
  strike_warning:                 { color: '#F59E0B', icon: AlertTriangle, category: 'Groups' },
  vote_required:                  { color: '#8B5CF6', icon: Vote,        category: 'Governance' },
  vote_closed:                    { color: '#8B5CF6', icon: Vote,        category: 'Governance' },
  welcome:                        { color: '#2EAF6F', icon: UserCircle,  category: 'Account' },
  identity_verified:              { color: '#2EAF6F', icon: Shield,      category: 'Account' },
  identity_verification_failed:   { color: '#EF4444', icon: Shield,      category: 'Account' },
  account_suspended:              { color: '#EF4444', icon: AlertTriangle, category: 'Account' },
  account_reactivated:            { color: '#2EAF6F', icon: UserCircle,  category: 'Account' },
  support_ticket_updated:         { color: '#2eafaf', icon: Bell,        category: 'Account' },
  support_ticket_closed:          { color: '#6B7280', icon: Bell,        category: 'Account' },
};

function getMeta(type: string) {
  return TYPE_META[type] ?? { color: '#6B7280', icon: Bell, category: 'Account' };
}

const TABS = ['All', 'Payments', 'Groups', 'Governance', 'Account'];

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

async function readJson<T>(response: { json(): Promise<unknown> }): Promise<ApiResponse<T> | null> {
  try {
    return await response.json() as ApiResponse<T>;
  } catch {
    return null;
  }
}

export default function NotificationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const authHeaders = useCallback(() => {
    const session = getValidSession();
    return session?.token ? { Authorization: 'Bearer ' + session.token } : null;
  }, []);

  const loadNotifications = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) {
      setError('Please log in to view your notifications.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await window.fetch('/api/notifications?limit=100', { headers });
      const json = await readJson<Notification[]>(response);
      if (!response.ok) {
        setError(getApiErrorMessage(json, 'We could not load your notifications right now.'));
        return;
      }
      setNotifications(json?.data ?? []);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => { void loadNotifications(); }, [loadNotifications]);

  const markRead = useCallback(async (id: string) => {
    const headers = authHeaders();
    if (!headers) return;
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    try {
      await window.fetch(`/api/notifications/${id}/read`, { method: 'PUT', headers });
    } catch { /* local state already updated optimistically; a manual refresh will resync */ }
  }, [authHeaders]);

  const markAllRead = useCallback(async () => {
    const headers = authHeaders();
    if (!headers) return;
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    try {
      await window.fetch('/api/notifications/read-all', { method: 'PUT', headers });
    } catch { /* ignore — state already reflects the intent locally */ }
  }, [authHeaders]);

  const dismiss = useCallback(async (id: string) => {
    const headers = authHeaders();
    if (!headers) return;
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await window.fetch(`/api/notifications/${id}`, { method: 'DELETE', headers });
    } catch { /* ignore */ }
  }, [authHeaders]);

  const visible = useMemo(() => notifications.filter(n => {
    if (activeTab === 'All') return true;
    return getMeta(n.type).category === activeTab;
  }), [notifications, activeTab]);

  const unread = notifications.filter(n => !n.is_read).length;

  const kpis = useMemo(() => ([
    { label: 'Unread', value: unread, color: '#EF4444', icon: Bell },
    { label: 'Payments', value: notifications.filter(n => getMeta(n.type).category === 'Payments').length, color: '#2EAF6F', icon: CreditCard },
    { label: 'Groups', value: notifications.filter(n => getMeta(n.type).category === 'Groups').length, color: '#8B5CF6', icon: Users },
    { label: 'Governance', value: notifications.filter(n => getMeta(n.type).category === 'Governance').length, color: '#F59E0B', icon: Vote },
  ]), [notifications, unread]);

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
        <title>Activity Centre — PadiHub</title>
        <meta name="description" content="Stay on top of your community activity, contributions and achievements on PadiHub." />
        <link rel="canonical" href="https://padihub.com/notifications" />
              <meta property="og:title" content="Activity Centre — PadiHub" />
        <meta property="og:description" content="Stay on top of your community activity, contributions and achievements on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Activity Centre</h1>
              <p className="text-gray-500 text-sm mt-1">
                {unread > 0 ? `${unread} unread notification${unread > 1 ? 's' : ''}` : 'All caught up!'}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {unread > 0 && (
                <button onClick={() => void markAllRead()}
                  className="px-3 py-2 rounded-2xl text-xs sm:text-sm font-bold transition-all hover:bg-gray-100 whitespace-nowrap"
                  style={{ background: '#F3F4F6', color: '#6B7280' }}>
                  Mark all read
                </button>
              )}
              <Link to="/notifications/settings"
                className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all hover:bg-gray-100 flex-shrink-0"
                style={{ background: '#F3F4F6' }}>
                <Settings size={16} style={{ color: '#6B7280' }} />
              </Link>
            </div>
          </MotionDiv>

          {error && (
            <MotionDiv variants={fadeUp} className="rounded-2xl p-4 flex items-start gap-3 mb-6" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#DC2626' }} />
              <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error}</p>
            </MotionDiv>
          )}

          {/* KPIs */}
          <MotionDiv variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {kpis.map(k => (
              <div key={k.label} className="rounded-2xl p-3 sm:p-4 bg-white text-center"
                style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <k.icon size={16} style={{ color: k.color, margin: '0 auto 6px' }} />
                <p className="text-xl font-black" style={{ color: k.color, fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                <p className="text-xs text-gray-500 leading-tight">{k.label}</p>
              </div>
            ))}
          </MotionDiv>

          {/* Tabs */}
          <MotionDiv variants={fadeUp} className="flex gap-2 overflow-x-auto pb-1 mb-5">
            {TABS.map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex-shrink-0"
                style={{ background: activeTab === tab ? '#2EAF6F' : '#F3F4F6', color: activeTab === tab ? '#fff' : '#6B7280' }}>
                {tab}
              </button>
            ))}
          </MotionDiv>

          {/* Notification list */}
          {visible.length === 0 ? (
            <MotionDiv variants={fadeUp} className="rounded-3xl p-12 text-center bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <Bell size={40} className="mx-auto mb-3 text-gray-200" />
              <p className="font-extrabold text-gray-400" style={{ fontFamily: 'Nunito, sans-serif' }}>No notifications here</p>
              <p className="text-sm text-gray-400">You're all caught up in this category.</p>
            </MotionDiv>
          ) : (
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="flex flex-col gap-3">
              {visible.map(n => {
                const meta = getMeta(n.type);
                const isRead = n.is_read;
                return (
                  <MotionDiv key={n.id} variants={fadeUp} layout
                    className="rounded-2xl p-4 bg-white flex items-start gap-3 relative group"
                    style={{
                      border: isRead ? '1px solid #F3F4F6' : `1px solid ${meta.color}20`,
                      background: isRead ? '#fff' : `${meta.color}04`,
                      boxShadow: isRead ? '0 1px 4px rgba(0,0,0,0.04)' : `0 2px 12px ${meta.color}10`,
                    }}>
                    {/* Unread dot */}
                    {!isRead && (
                      <div className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ background: meta.color }} />
                    )}

                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${meta.color}12` }}>
                      <meta.icon size={16} style={{ color: meta.color }} />
                    </div>

                    <div className="flex-1 min-w-0 pr-6">
                      <p className="font-bold text-gray-900 text-sm">{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-gray-400">{formatRelativeTime(n.created_at)}</span>
                        {!isRead && (
                          <button onClick={() => void markRead(n.id)}
                            className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>

                    <button onClick={() => void dismiss(n.id)}
                      className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: '#F3F4F6' }}>
                      <X size={10} style={{ color: '#9CA3AF' }} />
                    </button>
                  </MotionDiv>
                );
              })}
            </MotionDiv>
          )}

          {/* Four pillars */}
          <MotionDiv variants={fadeUp} className="flex flex-wrap justify-center gap-3 mt-8">
            {[
              { label: 'Trust',        color: '#2EAF6F', icon: Shield },
              { label: 'Transparency', color: '#2eafaf', icon: Globe },
              { label: 'Community',    color: '#8B5CF6', icon: Users },
              { label: 'Progress',     color: '#F59E0B', icon: TrendingUp },
            ].map(pill => (
              <div key={pill.label} className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: `${pill.color}08`, border: `1px solid ${pill.color}20` }}>
                <pill.icon size={13} style={{ color: pill.color }} />
                <span className="text-xs font-bold text-gray-600">{pill.label}</span>
              </div>
            ))}
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
