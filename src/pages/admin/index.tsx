import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { getValidSession, storeSession, clearStoredSession, logout, type SessionData } from '@/lib/session';
import { getApiErrorMessage } from '@/lib/api-error';
import {
  Users, PiggyBank, CreditCard, AlertTriangle,
  HelpCircle, Activity, Shield, ChevronRight,
  Bell, LogOut, BarChart2, KeyRound, Lock,
  CheckCircle, XCircle, RefreshCw, Mail, Database,
} from 'lucide-react';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

type Section = 'dashboard' | 'users' | 'groups' | 'subscriptions' | 'jobs' | 'tickets' | 'audit' | 'announcements';

const navItems: { id: Section; icon: typeof Users; label: string }[] = [
  { id: 'dashboard',     icon: BarChart2,    label: 'Dashboard' },
  { id: 'users',         icon: Users,        label: 'Users' },
  { id: 'groups',        icon: PiggyBank,    label: 'Groups' },
  { id: 'subscriptions', icon: CreditCard,   label: 'Subscriptions' },
  { id: 'jobs',          icon: RefreshCw,    label: 'Scheduled Jobs' },
  { id: 'tickets',       icon: HelpCircle,   label: 'Support Tickets' },
  { id: 'audit',         icon: Activity,     label: 'Audit Log' },
  { id: 'announcements', icon: Bell,         label: 'Announcements' },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:            { bg: 'rgba(46,175,111,0.1)',  color: '#2EAF6F', label: 'Active' },
    trialing:          { bg: 'rgba(46,175,111,0.1)',  color: '#2EAF6F', label: 'Trialing' },
    pending:           { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'Pending' },
    open:              { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'Open' },
    in_progress:       { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'In progress' },
    waiting_for_user:  { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'Waiting on user' },
    suspended:         { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Suspended' },
    past_due:          { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Past due' },
    deactivated:       { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Deactivated' },
    draft:             { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Draft' },
    closed:            { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Closed' },
    cancelled:         { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Cancelled' },
    expired:           { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Expired' },
    paused:            { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: 'Paused' },
    resolved:          { bg: 'rgba(46,175,111,0.1)',  color: '#2EAF6F', label: 'Resolved' },
    urgent:            { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Urgent' },
    high:              { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'High' },
    medium:            { bg: 'rgba(46,175,175,0.1)',  color: '#2eafaf', label: 'Medium' },
    low:                { bg: 'rgba(46,175,175,0.1)', color: '#2eafaf', label: 'Low' },
    success:           { bg: 'rgba(46,175,111,0.1)',  color: '#2EAF6F', label: 'Success' },
    failed:            { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Failed' },
  };
  const s = map[status] ?? { bg: 'rgba(107,114,128,0.1)', color: '#6B7280', label: status };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function countryLabel(country: string | null | undefined): string {
  if (!country) return 'Unknown';
  const map: Record<string, string> = { GB: 'UK', UK: 'UK', NG: 'Nigeria' };
  return map[country] ?? country;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}

function jobDisplayName(jobName: string): string {
  return jobName.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

// ─── API response shapes (mirrors adminController.ts / monitoringController.ts) ──

interface DashboardData {
  users: {
    total: number;
    active_last_30d: number;
    identity_verified: number;
    identity_verified_pct: number;
    by_country: { country: string; count: number }[];
  };
  groups: {
    active: number;
    by_country: { country: string; count: number }[];
  };
  contributions: { total: number; completed: number; failed: number; total_collected: number };
  rotations: { active: number };
  subscriptions: {
    uk: { count: number; mrr_gbp: string };
    ng: { count: number; mrr_ngn: string };
  };
  revenue: { uk_gbp: string; ng_ngn: string };
  daily_averages: {
    contribution_by_country: Record<string, number>;
    payout_by_country: Record<string, number>;
  };
  support: { open_tickets: number };
  monitoring: { errors_last_24h: number };
  db_usage: Record<string, number>;
  email_usage: { sent: number; sent_last_24h: number; failed: number; failed_last_24h: number };
}

interface SystemHealth {
  status: 'ok' | 'degraded';
  db: boolean;
  email: boolean;
  stripe: boolean;
  flutterwave: boolean;
  identity: boolean;
}

interface JobRun {
  id: string;
  job_name: string;
  status: 'success' | 'failed';
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

interface AdminUserRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  country: string | null;
  trust_score: number;
  account_status: string;
  subscription_status: string;
  identity_verified: boolean;
  role: string;
  created_at: string;
  last_login_at: string | null;
}

interface AdminGroupRow {
  id: string;
  name: string;
  country: string;
  currency: string;
  contribution_amount: string;
  status: string;
  member_count: number;
  created_at: string;
}

interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string | null;
  provider: string;
  plan: string;
  billing_status: string;
  renewal_date: string | null;
  created_at: string;
}

interface TicketRow {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string | null;
  subject: string;
  category: string;
  priority: string;
  status: string;
  admin_response: string | null;
  created_at: string;
}

interface AuditLogRow {
  id: string;
  user_id: string | null;
  user_display_name: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  created_at: string;
}

// Small helper — every /api/admin/* and /api/system/{jobs,errors} route already
// requires a valid admin JWT server-side; this just attaches it and unwraps
// the {success,data,message} envelope those endpoints share.
async function apiFetch<T>(path: string, session: SessionData, init?: Parameters<typeof window.fetch>[1]): Promise<T> {
  const response = await window.fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: 'Bearer ' + session.token },
  });
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; message?: string } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(getApiErrorMessage(payload, 'Something went wrong. Please try again.'));
  }
  return payload.data as T;
}

// Standalone sign-in surface shown in place of the dashboard whenever there's
// no valid admin session — a dedicated username/password credential (see
// authService.adminLogin) that never touches the member email/login flow,
// so /admin never has to route through /login.
function AdminLoginForm({ onSuccess, notice }: { onSuccess: (session: SessionData) => void; notice?: string | null }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) { setError('Please enter both the admin username and password.'); return; }
    setError(null);
    setLoading(true);
    try {
      const response = await window.fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; data?: { token: string; user: Record<string, unknown> }; message?: string } | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(getApiErrorMessage(payload, 'Invalid username or password.'));
      }
      const { token, user } = payload.data;
      const sessionData: SessionData = {
        token,
        name: (user.display_name as string) || (user.first_name as string) || 'Admin',
        email: user.email as string,
        userId: user.id as string,
        role: user.role as string,
      };
      storeSession(sessionData);
      onSuccess(sessionData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: 'linear-gradient(180deg, #0F172A 0%, #1A1A2E 100%)' }}>
      <Helmet>
        <title>Admin sign in — PadiHub</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl p-8" style={{ background: '#161B29', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)' }}>
            <Shield size={18} style={{ color: '#EF4444' }} />
          </div>
          <div>
            <p className="text-white text-sm font-extrabold" style={{ fontFamily: 'Nunito, sans-serif' }}>Admin Portal</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>PadiHub Platform</p>
          </div>
        </div>
        {notice && !error && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(46,175,111,0.1)', color: '#4ADE80' }}>
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#F87171' }}>
            {error}
          </div>
        )}
        <label className="block mb-4">
          <span className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Username</span>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-2xl px-4 py-2.5 text-sm text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </label>
        <label className="block mb-6">
          <span className="block text-xs font-semibold mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl px-4 py-2.5 text-sm text-white outline-none"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
          />
        </label>
        <button type="submit" disabled={loading}
          className="w-full rounded-2xl py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

// Small modal, reachable from the sidebar once signed in, that lets an admin
// change their own password at any time — reuses the same authenticated
// /api/auth/change-password endpoint every member uses (authService.
// changePassword), so no new backend password-change logic is needed.
function AdminChangePasswordModal({ session, onClose, onChanged }: { session: SessionData; onClose: () => void; onChanged: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) { setError('Please complete all fields.'); return; }
    if (newPassword !== confirmPassword) { setError('New password and confirmation do not match.'); return; }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Use at least 8 characters, including 1 uppercase letter and 1 number.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/api/auth/change-password', session, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to change the password right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,0.6)' }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl bg-white p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound size={18} style={{ color: '#EF4444' }} />
          <p className="text-sm font-extrabold text-gray-900">Change admin password</p>
        </div>
        {error && (
          <div className="mb-4 rounded-2xl px-4 py-3 text-sm font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: '#B91C1C' }}>
            {error}
          </div>
        )}
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-gray-500 mb-1.5">Current password</span>
          <input type="password" autoComplete="current-password" value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm border border-gray-200 outline-none" />
        </label>
        <label className="block mb-3">
          <span className="block text-xs font-semibold text-gray-500 mb-1.5">New password</span>
          <input type="password" autoComplete="new-password" value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm border border-gray-200 outline-none" />
        </label>
        <label className="block mb-5">
          <span className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm new password</span>
          <input type="password" autoComplete="new-password" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm border border-gray-200 outline-none" />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 rounded-2xl py-2.5 text-sm font-bold text-gray-600 border border-gray-200">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 rounded-2xl py-2.5 text-sm font-bold text-white disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>
            {saving ? 'Saving…' : 'Save password'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPortal() {
  const navigate = useNavigate();
  const [authStatus, setAuthStatus] = useState<'checking' | 'authorized' | 'denied' | 'login-required'>('checking');
  const [session, setSession] = useState<SessionData | null>(null);
  const [section, setSection] = useState<Section>('dashboard');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [loginNotice, setLoginNotice] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Dashboard
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [recentAudit, setRecentAudit] = useState<AuditLogRow[]>([]);

  // Users
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Groups
  const [groups, setGroups] = useState<AdminGroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionRow[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(true);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);

  // Tickets
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});

  // Audit
  const [auditLog, setAuditLog] = useState<AuditLogRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  // Jobs (pre-existing real data tab)
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // Gate the whole page on a valid, admin-role session. The server already
  // rejects every real /api/admin/* and /api/system/{jobs,errors} call with
  // 403 for non-admins (requireRole('admin')) — this just stops the page
  // shell itself from rendering for anyone who isn't signed in as an admin,
  // so the URL isn't a usable decoy for curious non-admin users. A signed-in
  // non-admin member is redirected away entirely; a visitor with no session
  // at all is shown the inline admin sign-in form below instead of being
  // bounced to the member /login page (the admin account has no email/login
  // page identity to sign in with there).
  useEffect(() => {
    const current = getValidSession();
    if (current?.token && current.role !== 'admin') {
      setAuthStatus('denied');
      navigate('/dashboard', { replace: true });
      return;
    }
    if (current?.token && current.role === 'admin') {
      setSession(current);
      setAuthStatus('authorized');
      return;
    }
    setAuthStatus('login-required');
  }, [navigate]);

  const loadJobRuns = useCallback(() => {
    if (!session) return;
    setJobsLoading(true);
    apiFetch<JobRun[]>('/api/system/jobs', session)
      .then((data) => { setJobRuns(data); setJobsError(null); })
      .catch((error: unknown) => setJobsError(error instanceof Error ? error.message : 'Unable to load scheduled job status right now.'))
      .finally(() => setJobsLoading(false));
  }, [session]);

  const loadDashboard = useCallback(() => {
    if (!session) return;
    setDashboardLoading(true);
    Promise.all([
      apiFetch<DashboardData>('/api/admin/dashboard', session),
      apiFetch<SystemHealth>('/api/system/health', session),
      apiFetch<AuditLogRow[]>('/api/admin/audit?limit=5', session),
    ])
      .then(([dashboardData, healthData, auditData]) => {
        setDashboard(dashboardData);
        setHealth(healthData);
        setRecentAudit(auditData);
        setDashboardError(null);
      })
      .catch((error: unknown) => setDashboardError(error instanceof Error ? error.message : 'Unable to load the dashboard right now.'))
      .finally(() => setDashboardLoading(false));
  }, [session]);

  const loadUsers = useCallback(() => {
    if (!session) return;
    setUsersLoading(true);
    apiFetch<AdminUserRow[]>('/api/admin/users?limit=50', session)
      .then((data) => { setUsers(data); setUsersError(null); })
      .catch((error: unknown) => setUsersError(error instanceof Error ? error.message : 'Unable to load users right now.'))
      .finally(() => setUsersLoading(false));
  }, [session]);

  const loadGroups = useCallback(() => {
    if (!session) return;
    setGroupsLoading(true);
    apiFetch<AdminGroupRow[]>('/api/admin/groups?limit=50', session)
      .then((data) => { setGroups(data); setGroupsError(null); })
      .catch((error: unknown) => setGroupsError(error instanceof Error ? error.message : 'Unable to load groups right now.'))
      .finally(() => setGroupsLoading(false));
  }, [session]);

  const loadSubscriptions = useCallback(() => {
    if (!session) return;
    setSubscriptionsLoading(true);
    apiFetch<AdminSubscriptionRow[]>('/api/admin/subscriptions?limit=50', session)
      .then((data) => { setSubscriptions(data); setSubscriptionsError(null); })
      .catch((error: unknown) => setSubscriptionsError(error instanceof Error ? error.message : 'Unable to load subscriptions right now.'))
      .finally(() => setSubscriptionsLoading(false));
  }, [session]);

  const loadTickets = useCallback(() => {
    if (!session) return;
    setTicketsLoading(true);
    apiFetch<TicketRow[]>('/api/admin/support?limit=50', session)
      .then((data) => { setTickets(data); setTicketsError(null); })
      .catch((error: unknown) => setTicketsError(error instanceof Error ? error.message : 'Unable to load support tickets right now.'))
      .finally(() => setTicketsLoading(false));
  }, [session]);

  const loadAuditLog = useCallback(() => {
    if (!session) return;
    setAuditLoading(true);
    apiFetch<AuditLogRow[]>('/api/admin/audit?limit=100', session)
      .then((data) => { setAuditLog(data); setAuditError(null); })
      .catch((error: unknown) => setAuditError(error instanceof Error ? error.message : 'Unable to load the audit log right now.'))
      .finally(() => setAuditLoading(false));
  }, [session]);

  useEffect(() => {
    if (authStatus !== 'authorized') return;
    if (section === 'jobs') loadJobRuns();
    if (section === 'dashboard') loadDashboard();
    if (section === 'users') loadUsers();
    if (section === 'groups') loadGroups();
    if (section === 'subscriptions') loadSubscriptions();
    if (section === 'tickets') loadTickets();
    if (section === 'audit') loadAuditLog();
  }, [authStatus, section, loadJobRuns, loadDashboard, loadUsers, loadGroups, loadSubscriptions, loadTickets, loadAuditLog]);

  const suspendUser = async (user: AdminUserRow) => {
    if (!session) return;
    if (!window.confirm(`Suspend ${user.email}? They will be notified and locked out until reactivated.`)) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/suspend`, session, { method: 'PUT' });
      loadUsers();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to suspend this user right now.');
    }
  };

  const reactivateUser = async (user: AdminUserRow) => {
    if (!session) return;
    if (!window.confirm(`Reactivate ${user.email}?`)) return;
    try {
      await apiFetch(`/api/admin/users/${user.id}/reactivate`, session, { method: 'PUT' });
      loadUsers();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to reactivate this user right now.');
    }
  };

  const forceCloseGroup = async (group: AdminGroupRow) => {
    if (!session) return;
    if (!window.confirm(`Force-close "${group.name}"? All members will be notified. This cannot be undone.`)) return;
    try {
      await apiFetch(`/api/admin/groups/${group.id}/close`, session, { method: 'PUT' });
      loadGroups();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to close this group right now.');
    }
  };

  const cancelSubscription = async (subscription: AdminSubscriptionRow) => {
    if (!session) return;
    if (!window.confirm(`Cancel the subscription for ${subscription.user_display_name}?`)) return;
    try {
      await apiFetch(`/api/admin/subscriptions/${subscription.id}/cancel`, session, { method: 'PUT' });
      loadSubscriptions();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to cancel this subscription right now.');
    }
  };

  const respondToTicket = async (ticket: TicketRow) => {
    if (!session) return;
    const message = (ticketReplies[ticket.id] ?? '').trim();
    if (!message) { window.alert('Write a response before sending.'); return; }
    try {
      await apiFetch(`/api/admin/support/${ticket.id}`, session, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_response: message }),
      });
      setTicketReplies((prev) => ({ ...prev, [ticket.id]: '' }));
      loadTickets();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to update this ticket right now.');
    }
  };

  const closeTicket = async (ticket: TicketRow) => {
    if (!session) return;
    const resolution = (ticketReplies[ticket.id] ?? '').trim() || undefined;
    if (!window.confirm('Close this ticket?')) return;
    try {
      await apiFetch(`/api/admin/support/${ticket.id}/close`, session, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      setTicketReplies((prev) => ({ ...prev, [ticket.id]: '' }));
      loadTickets();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to close this ticket right now.');
    }
  };

  const handleSignOut = async () => {
    await logout();
    setSession(null);
    setAuthStatus('login-required');
  };

  if (authStatus === 'login-required') {
    return (
      <AdminLoginForm
        notice={loginNotice}
        onSuccess={(next) => { setSession(next); setAuthStatus('authorized'); setLoginNotice(null); }}
      />
    );
  }

  if (authStatus !== 'authorized') {
    // 'checking' (pre-check) or 'denied' (a signed-in non-admin being
    // redirected away) — nothing meaningful to render either way.
    return null;
  }

  const kpis = dashboard ? [
    { label: 'Total Users',          value: dashboard.users.total.toLocaleString(),                         change: `${dashboard.users.active_last_30d} active in last 30d`, color: '#2EAF6F', icon: Users },
    { label: 'Active Groups',         value: dashboard.groups.active.toLocaleString(),                       change: `${dashboard.rotations.active} rotations in progress`,  color: '#2eafaf', icon: PiggyBank },
    { label: 'Active Subscriptions',  value: (dashboard.subscriptions.uk.count + dashboard.subscriptions.ng.count).toLocaleString(), change: `${dashboard.subscriptions.uk.count} UK · ${dashboard.subscriptions.ng.count} NG`, color: '#8B5CF6', icon: CreditCard },
    { label: 'Revenue UK (GBP)',      value: `£${Number(dashboard.revenue.uk_gbp).toLocaleString()}`,        change: 'Actual charges collected',                              color: '#F59E0B', icon: BarChart2 },
    { label: 'Revenue Nigeria (NGN)', value: `₦${Number(dashboard.revenue.ng_ngn).toLocaleString()}`,        change: 'Actual charges collected',                              color: '#F59E0B', icon: BarChart2 },
    { label: 'Identity Verified',     value: `${dashboard.users.identity_verified_pct}%`,                    change: `${dashboard.users.identity_verified} of ${dashboard.users.total} users`, color: '#2EAF6F', icon: CheckCircle },
    { label: 'Failed Contributions',  value: dashboard.contributions.failed.toLocaleString(),                change: `${dashboard.contributions.completed} completed`,        color: '#EF4444', icon: AlertTriangle },
    { label: 'Open Support Tickets',  value: dashboard.support.open_tickets.toLocaleString(),                change: 'Awaiting a response',                                   color: '#F59E0B', icon: HelpCircle },
    { label: 'Errors (last 24h)',     value: dashboard.monitoring.errors_last_24h.toLocaleString(),          change: 'Unresolved system_errors',                              color: dashboard.monitoring.errors_last_24h > 0 ? '#EF4444' : '#2EAF6F', icon: AlertTriangle },
  ] : [];

  return (
    <>
    <div className="flex h-screen overflow-hidden" style={{ background: '#F8FAFC' }}>
      <Helmet>
        <title>Admin Portal — PadiHub</title>
        <meta name="description" content="PadiHub platform administration — manage users, groups, subscriptions and support tickets." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://padihub.com/admin" />
        <meta property="og:title" content="Admin Portal — PadiHub" />
        <meta property="og:description" content="PadiHub platform administration — manage users, groups, subscriptions and support tickets." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>

      {/* Sidebar */}
      <aside className={`${
        mobileMenuOpen ? 'fixed inset-0 z-40' : 'hidden lg:flex'
      } lg:relative w-60 flex-shrink-0 flex-col h-full`}
        style={{ background: 'linear-gradient(180deg, #0F172A 0%, #1A1A2E 100%)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>
        {/* Mobile close button */}
        {mobileMenuOpen && (
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute top-4 right-4 lg:hidden z-50 p-2 text-white hover:bg-white/10 rounded-lg"
            type="button"
          >
            <span className="text-2xl">✕</span>
          </button>
        )}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)' }}>
              <Shield size={16} style={{ color: '#EF4444' }} />
            </div>
            <div>
              <p className="text-white text-sm font-extrabold" style={{ fontFamily: 'Nunito, sans-serif' }}>Admin Portal</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>PadiHub Platform</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => { setSection(item.id); setMobileMenuOpen(false); }} type="button"
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200"
              style={{
                background: section === item.id ? 'rgba(239,68,68,0.15)' : 'transparent',
                color: section === item.id ? '#EF4444' : 'rgba(255,255,255,0.6)',
              }}>
              <item.icon size={16} style={{ color: section === item.id ? '#EF4444' : 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
              {item.label}
              {section === item.id && <div className="ml-auto w-1.5 h-1.5 rounded-full" style={{ background: '#EF4444' }} />}
            </button>
          ))}
        </nav>
        <div className="px-3 py-3 border-t space-y-0.5" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <button onClick={() => setShowChangePassword(true)} type="button"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-colors"
            style={{ color: 'rgba(255,255,255,0.6)' }}>
            <Lock size={16} style={{ color: 'rgba(255,255,255,0.35)' }} /> Change password
          </button>
          <button onClick={handleSignOut} type="button"
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold text-red-400 hover:bg-red-400/10 transition-colors">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center gap-3 px-6 bg-white border-b border-gray-100 flex-shrink-0">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            type="button"
            className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={mobileMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-900">{navItems.find(n => n.id === section)?.label}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1 rounded-full text-xs font-bold" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
              Admin
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}>
              {(session?.name || session?.email || 'A')[0]?.toUpperCase()}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <MotionDiv initial="hidden" animate="visible" variants={stagger}>

            {/* Dashboard */}
            {section === 'dashboard' && (
              <div className="space-y-6">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Platform Overview</h1>
                    <p className="text-gray-400 text-sm mt-1">Real platform health and key metrics, sourced live from the database</p>
                  </div>
                  <button onClick={loadDashboard} disabled={dashboardLoading} type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white flex-shrink-0 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    <RefreshCw size={14} className={dashboardLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>

                {dashboardError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{dashboardError}</p>
                  </MotionDiv>
                )}

                {dashboardLoading && !dashboard && <p className="text-sm text-gray-400">Loading dashboard…</p>}

                {dashboard && (
                  <>
                    <MotionDiv variants={stagger} className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                      {kpis.map(kpi => (
                        <MotionDiv key={kpi.label} variants={fadeUp}
                          className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                          <div className="flex items-center justify-between mb-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${kpi.color}15` }}>
                              <kpi.icon size={16} style={{ color: kpi.color }} />
                            </div>
                            <ChevronRight size={14} className="text-gray-300" />
                          </div>
                          <p className="text-2xl font-black text-gray-900 mb-0.5" style={{ fontFamily: 'Nunito, sans-serif' }}>{kpi.value}</p>
                          <p className="text-xs font-semibold text-gray-500 mb-1">{kpi.label}</p>
                          <p className="text-xs" style={{ color: kpi.color }}>{kpi.change}</p>
                        </MotionDiv>
                      ))}
                    </MotionDiv>

                    {/* Location / country breakdown */}
                    <MotionDiv variants={fadeUp} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                        <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Users &amp; Groups by Country</h2>
                        <div className="space-y-2">
                          {dashboard.users.by_country.map((row) => {
                            const groupCount = dashboard.groups.by_country.find(g => g.country === row.country)?.count ?? 0;
                            return (
                              <div key={row.country} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                                <span className="font-semibold text-gray-700">{countryLabel(row.country)}</span>
                                <span className="text-gray-500">{row.count} users · {groupCount} groups</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                        <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Rolling 30-day Daily Average (per country)</h2>
                        <div className="space-y-2">
                          {Object.keys({ ...dashboard.daily_averages.contribution_by_country, ...dashboard.daily_averages.payout_by_country }).map((country) => (
                            <div key={country} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                              <span className="font-semibold text-gray-700">{countryLabel(country)}</span>
                              <span className="text-gray-500">
                                Contribution: {(dashboard.daily_averages.contribution_by_country[country] ?? 0).toLocaleString()} · Payout: {(dashboard.daily_averages.payout_by_country[country] ?? 0).toLocaleString()}
                              </span>
                            </div>
                          ))}
                          {Object.keys({ ...dashboard.daily_averages.contribution_by_country, ...dashboard.daily_averages.payout_by_country }).length === 0 && (
                            <p className="text-sm text-gray-400">No contribution/payout activity in the last 30 days.</p>
                          )}
                        </div>
                      </div>
                    </MotionDiv>

                    {/* App health, DB usage, email usage */}
                    <MotionDiv variants={fadeUp} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                        <h2 className="font-extrabold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                          <Activity size={16} style={{ color: health?.status === 'ok' ? '#2EAF6F' : '#EF4444' }} /> App Health
                        </h2>
                        {health ? (
                          <div className="space-y-2 text-sm">
                            {(['db', 'email', 'stripe', 'flutterwave', 'identity'] as const).map((key) => (
                              <div key={key} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                                <span className="capitalize text-gray-600">{key}</span>
                                <StatusBadge status={health[key] ? 'success' : 'failed'} />
                              </div>
                            ))}
                          </div>
                        ) : <p className="text-sm text-gray-400">Loading…</p>}
                      </div>
                      <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                        <h2 className="font-extrabold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                          <Database size={16} style={{ color: '#8B5CF6' }} /> Database Usage
                        </h2>
                        <div className="space-y-1.5 text-sm max-h-48 overflow-y-auto">
                          {Object.entries(dashboard.db_usage).map(([table, count]) => (
                            <div key={table} className="flex items-center justify-between py-0.5">
                              <span className="text-gray-600">{table}</span>
                              <span className="font-semibold text-gray-900">{count.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                        <h2 className="font-extrabold text-gray-900 mb-4 flex items-center gap-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                          <Mail size={16} style={{ color: '#F59E0B' }} /> Email Usage
                        </h2>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between py-1 border-b border-gray-50">
                            <span className="text-gray-600">Sent</span>
                            <span className="font-semibold text-gray-900">{dashboard.email_usage.sent.toLocaleString()} ({dashboard.email_usage.sent_last_24h} last 24h)</span>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <span className="text-gray-600">Failed</span>
                            <span className="font-semibold" style={{ color: dashboard.email_usage.failed > 0 ? '#EF4444' : '#111827' }}>{dashboard.email_usage.failed.toLocaleString()} ({dashboard.email_usage.failed_last_24h} last 24h)</span>
                          </div>
                        </div>
                      </div>
                    </MotionDiv>

                    {/* Recent activity */}
                    <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent Audit Activity</h2>
                      <div className="space-y-3">
                        {recentAudit.length === 0 && <p className="text-sm text-gray-400">No recent activity.</p>}
                        {recentAudit.map((log) => (
                          <div key={log.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.08)' }}>
                              <Activity size={14} style={{ color: '#EF4444' }} />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-gray-900">{log.action.replace(/_/g, ' ')}</p>
                              <p className="text-xs text-gray-400">{log.entity ?? 'system'} · by {log.user_display_name}</p>
                            </div>
                            <span className="text-xs text-gray-400">{formatTimestamp(log.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </MotionDiv>
                  </>
                )}
              </div>
            )}

            {/* Users */}
            {section === 'users' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Users</h1>
                  <button onClick={loadUsers} disabled={usersLoading} type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    <RefreshCw size={14} className={usersLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>
                {usersError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{usersError}</p>
                  </MotionDiv>
                )}
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden overflow-x-auto" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {['Name', 'Country', 'Trust Score', 'Status', 'Verified', 'Joined', 'Actions'].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-gray-400 px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!usersLoading && users.length === 0 && (
                        <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">No users found.</td></tr>
                      )}
                      {users.map((u) => {
                        const name = `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email.split('@')[0];
                        return (
                          <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>{name[0]?.toUpperCase()}</div>
                                <div>
                                  <p className="text-sm font-bold text-gray-900">{name}</p>
                                  <p className="text-xs text-gray-400">{u.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3"><span className="text-sm text-gray-600">{countryLabel(u.country)}</span></td>
                            <td className="px-5 py-3"><span className="text-sm font-bold" style={{ color: '#2EAF6F' }}>{u.trust_score || '—'}</span></td>
                            <td className="px-5 py-3"><StatusBadge status={u.account_status} /></td>
                            <td className="px-5 py-3">{u.identity_verified ? <CheckCircle size={14} style={{ color: '#2EAF6F' }} /> : <XCircle size={14} className="text-gray-300" />}</td>
                            <td className="px-5 py-3"><span className="text-xs text-gray-400">{formatTimestamp(u.created_at)}</span></td>
                            <td className="px-5 py-3">
                              {u.account_status === 'suspended' ? (
                                <button onClick={() => reactivateUser(u)} type="button" className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: '#2EAF6F', background: 'rgba(46,175,111,0.1)' }}>Reactivate</button>
                              ) : (
                                <button onClick={() => suspendUser(u)} type="button" className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>Suspend</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </MotionDiv>
              </div>
            )}

            {/* Groups */}
            {section === 'groups' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Groups</h1>
                  <button onClick={loadGroups} disabled={groupsLoading} type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    <RefreshCw size={14} className={groupsLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>
                {groupsError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{groupsError}</p>
                  </MotionDiv>
                )}
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden overflow-x-auto" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {['Group Name', 'Country', 'Members', 'Contribution', 'Status', 'Created', 'Actions'].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-gray-400 px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!groupsLoading && groups.length === 0 && (
                        <tr><td colSpan={7} className="px-5 py-8 text-center text-sm text-gray-400">No groups found.</td></tr>
                      )}
                      {groups.map((g) => (
                        <tr key={g.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3"><p className="text-sm font-bold text-gray-900">{g.name}</p></td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{countryLabel(g.country)}</span></td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{g.member_count}</span></td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{g.currency} {g.contribution_amount}</span></td>
                          <td className="px-5 py-3"><StatusBadge status={g.status} /></td>
                          <td className="px-5 py-3"><span className="text-xs text-gray-400">{formatTimestamp(g.created_at)}</span></td>
                          <td className="px-5 py-3">
                            {g.status !== 'closed' && (
                              <button onClick={() => forceCloseGroup(g)} type="button" className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>Force Close</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MotionDiv>
              </div>
            )}

            {/* Support Tickets */}
            {section === 'tickets' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Support Tickets</h1>
                    <p className="text-gray-400 text-sm mt-1">{tickets.filter(t => t.status === 'open').length} open tickets</p>
                  </div>
                  <button onClick={loadTickets} disabled={ticketsLoading} type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    <RefreshCw size={14} className={ticketsLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>
                {ticketsError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{ticketsError}</p>
                  </MotionDiv>
                )}
                {!ticketsLoading && tickets.length === 0 && !ticketsError && (
                  <p className="text-sm text-gray-400">No support tickets.</p>
                )}
                <div className="space-y-3">
                  {tickets.map((t) => (
                    <MotionDiv key={t.id} variants={fadeUp}
                      className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                          style={{ background: t.priority === 'urgent' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)' }}>
                          <AlertTriangle size={18} style={{ color: t.priority === 'urgent' ? '#EF4444' : '#F59E0B' }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <StatusBadge status={t.priority} />
                            <StatusBadge status={t.status} />
                          </div>
                          <p className="text-sm font-bold text-gray-900">{t.subject}</p>
                          <p className="text-xs text-gray-400">{t.user_display_name} ({t.user_email}) · {formatTimestamp(t.created_at)}</p>
                          {t.admin_response && <p className="text-xs text-gray-500 mt-1">Last response: {t.admin_response}</p>}
                        </div>
                      </div>
                      {t.status !== 'closed' && (
                        <div className="mt-3 flex items-center gap-2">
                          <input
                            value={ticketReplies[t.id] ?? ''}
                            onChange={(e) => setTicketReplies((prev) => ({ ...prev, [t.id]: e.target.value }))}
                            placeholder="Write a response…"
                            className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-green-400"
                          />
                          <button onClick={() => respondToTicket(t)} type="button"
                            className="px-4 py-2 rounded-2xl text-xs font-bold text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>Respond</button>
                          <button onClick={() => closeTicket(t)} type="button"
                            className="px-4 py-2 rounded-2xl text-xs font-bold flex-shrink-0" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>Close</button>
                        </div>
                      )}
                    </MotionDiv>
                  ))}
                </div>
              </div>
            )}

            {/* Audit Log */}
            {section === 'audit' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Audit Log</h1>
                  <button onClick={loadAuditLog} disabled={auditLoading} type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    <RefreshCw size={14} className={auditLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>
                {auditError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{auditError}</p>
                  </MotionDiv>
                )}
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  {!auditLoading && auditLog.length === 0 && (
                    <p className="px-5 py-8 text-center text-sm text-gray-400">No audit log entries.</p>
                  )}
                  {auditLog.map((log) => (
                    <div key={log.id} className="flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-0">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(239,68,68,0.08)' }}>
                        <Activity size={14} style={{ color: '#EF4444' }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{log.action.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400">Entity: {log.entity ?? '—'} · Actor: {log.user_display_name}</p>
                      </div>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatTimestamp(log.created_at)}</span>
                    </div>
                  ))}
                </MotionDiv>
              </div>
            )}

            {/* Subscriptions */}
            {section === 'subscriptions' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Subscriptions</h1>
                  <button onClick={loadSubscriptions} disabled={subscriptionsLoading} type="button"
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    <RefreshCw size={14} className={subscriptionsLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>
                {subscriptionsError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{subscriptionsError}</p>
                  </MotionDiv>
                )}
                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden overflow-x-auto" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {['Member', 'Provider', 'Plan', 'Status', 'Renews', 'Actions'].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-gray-400 px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!subscriptionsLoading && subscriptions.length === 0 && (
                        <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-gray-400">No subscriptions found.</td></tr>
                      )}
                      {subscriptions.map((s) => (
                        <tr key={s.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3">
                            <p className="text-sm font-bold text-gray-900">{s.user_display_name}</p>
                            <p className="text-xs text-gray-400">{s.user_email}</p>
                          </td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600 capitalize">{s.provider}</span></td>
                          <td className="px-5 py-3"><span className="text-sm text-gray-600">{s.plan}</span></td>
                          <td className="px-5 py-3"><StatusBadge status={s.billing_status} /></td>
                          <td className="px-5 py-3"><span className="text-xs text-gray-400">{formatTimestamp(s.renewal_date)}</span></td>
                          <td className="px-5 py-3">
                            {s.billing_status !== 'cancelled' && (
                              <button onClick={() => cancelSubscription(s)} type="button" className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ color: '#EF4444', background: 'rgba(239,68,68,0.1)' }}>Cancel</button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MotionDiv>
              </div>
            )}

            {/* Scheduled Jobs — real data, sourced from /api/system/jobs so job
                execution (contribution charges, payouts, subscription renewals, etc.) is
                independently verifiable from the admin portal. */}
            {section === 'jobs' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp} className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Scheduled Jobs</h1>
                    <p className="text-gray-400 text-sm mt-1">Most recent run of each scheduled job — contribution charges, payouts, subscription renewals and more</p>
                  </div>
                  <button
                    onClick={loadJobRuns}
                    disabled={jobsLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-bold text-white flex-shrink-0 disabled:opacity-60"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
                    type="button"
                  >
                    <RefreshCw size={14} className={jobsLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </MotionDiv>

                {jobsError && (
                  <MotionDiv variants={fadeUp} className="rounded-2xl p-4 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>{jobsError}</p>
                  </MotionDiv>
                )}

                <MotionDiv variants={fadeUp} className="rounded-3xl bg-white overflow-hidden" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-50">
                        {['Job', 'Status', 'Started', 'Completed', 'Error'].map(h => (
                          <th key={h} className="text-left text-xs font-bold text-gray-400 px-5 py-3">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!jobsLoading && jobRuns.length === 0 && !jobsError && (
                        <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-gray-400">No scheduled jobs have run yet.</td></tr>
                      )}
                      {jobRuns.map((run) => (
                        <tr key={run.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3"><p className="text-sm font-bold text-gray-900">{jobDisplayName(run.job_name)}</p></td>
                          <td className="px-5 py-3"><StatusBadge status={run.status} /></td>
                          <td className="px-5 py-3"><span className="text-xs text-gray-400">{formatTimestamp(run.started_at)}</span></td>
                          <td className="px-5 py-3"><span className="text-xs text-gray-400">{formatTimestamp(run.completed_at)}</span></td>
                          <td className="px-5 py-3"><span className="text-xs text-red-500">{run.error_message || '—'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </MotionDiv>
              </div>
            )}

            {/* Announcements — no backend endpoint exists yet (no bulk-email/notification
                fan-out route). Left as a clearly-marked placeholder rather than a
                fake-functional form, until a real announcements feature is scoped. */}
            {section === 'announcements' && (
              <div className="space-y-5">
                <MotionDiv variants={fadeUp}>
                  <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Platform Announcements</h1>
                </MotionDiv>
                <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-start gap-3">
                    <Bell size={20} style={{ color: '#F59E0B', flexShrink: 0 }} />
                    <div>
                      <h2 className="font-bold text-gray-900 mb-1">Not yet available</h2>
                      <p className="text-sm text-gray-500">
                        There is no bulk-announcement backend yet (no route to fan out a message/email to all — or a filtered subset of — users).
                        This tab is a placeholder rather than a functional form. Let us know if you&apos;d like this built as a follow-up feature.
                      </p>
                    </div>
                  </div>
                </MotionDiv>
              </div>
            )}

          </MotionDiv>
        </main>
      </div>
    </div>
    {showChangePassword && session && (
      <AdminChangePasswordModal
        session={session}
        onClose={() => setShowChangePassword(false)}
        onChanged={() => {
          setShowChangePassword(false);
          clearStoredSession();
          setSession(null);
          setLoginNotice('Password changed successfully. Please sign in again with your new password.');
          setAuthStatus('login-required');
        }}
      />
    )}
    </>
  );
}
