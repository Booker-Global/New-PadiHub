import { ReactNode, useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, PiggyBank, Shield,
  Bell, User, Settings, Menu, X,
  Plus, Search, ChevronDown, Zap,
  HelpCircle, UserPlus, LayoutGrid, LogOut,
  CreditCard
} from 'lucide-react';
import { getValidSession, logout } from '@/lib/session';

// ─── Session hook ────────────────────────────────────────────────────────────
// Uses getValidSession() so a stored session whose JWT has already expired is
// treated as logged-out (cleared) rather than silently showing a stale
// "logged in" navbar with no re-authentication (see src/lib/session.ts).
//
// The trust score is re-fetched from the real backend (/api/users/stats)
// rather than trusting the value cached in the session at login time, since
// that value goes stale the moment the user contributes, votes, or gets
// verified without logging out and back in.
function useDashboardUser() {
  const [user, setUser] = useState<{
    name: string; trust: number; initial: string; tier: 'basic' | 'premium' | null;
    country: string | null; isGroupLeader: boolean;
    groupsJoinedCount: number | null; groupsJoinedLimit: number | null;
  }>({
    name: '', trust: 0, initial: '', tier: null, country: null, isGroupLeader: false,
    groupsJoinedCount: null, groupsJoinedLimit: null,
  });
  useEffect(() => {
    const session = getValidSession();
    if (!session) {
      setUser({ name: '', trust: 0, initial: '', tier: null, country: null, isGroupLeader: false, groupsJoinedCount: null, groupsJoinedLimit: null });
      return;
    }
    const name = session.name || '';
    setUser({
      name,
      trust: session.trust ?? 0,
      initial: name.charAt(0).toUpperCase() || '?',
      tier: null,
      country: null,
      isGroupLeader: false,
      groupsJoinedCount: null,
      groupsJoinedLimit: null,
    });

    let cancelled = false;
    void window.fetch('/api/users/stats', { headers: { Authorization: 'Bearer ' + session.token } })
      .then(response => response.ok ? response.json() : null)
      .then((json: { data?: {
        trust_score?: number; subscription_tier?: 'basic' | 'premium' | null; country?: string;
        is_group_leader?: boolean; groups_joined_count?: number; groups_joined_limit?: number | null;
      } } | null) => {
        if (!cancelled && json?.data) {
          setUser(current => ({
            ...current,
            trust: typeof json.data!.trust_score === 'number' ? json.data!.trust_score! : current.trust,
            tier: json.data!.subscription_tier ?? null,
            country: json.data!.country ?? null,
            isGroupLeader: json.data!.is_group_leader ?? false,
            groupsJoinedCount: typeof json.data!.groups_joined_count === 'number' ? json.data!.groups_joined_count! : current.groupsJoinedCount,
            groupsJoinedLimit: json.data!.groups_joined_limit ?? current.groupsJoinedLimit,
          }));
        }
      })
      .catch(() => { /* keep the session's cached value if the refresh fails */ });
    return () => { cancelled = true; };
  }, []);
  return user;
}

// ─── Nav config ──────────────────────────────────────────────────────────────

const mainNav = [
  { icon: LayoutDashboard, label: 'Dashboard',    href: '/dashboard' },
  { icon: PiggyBank,       label: 'My Groups',    href: '/savings-groups' },
  { icon: Bell,            label: 'Notifications',href: '/notifications' },
];

const identityNav = [
  { icon: Shield, label: 'Trust Score™', href: '/trust' },
];

const communityNav = [
  { icon: User,       label: 'Profile',  href: '/profile' },
  { icon: CreditCard, label: 'Payments', href: '/payments/methods' },
  { icon: Settings,   label: 'Settings', href: '/settings' },
  { icon: HelpCircle, label: 'Help',     href: '/help' },
];

const mobileBottomNav = [
  { icon: LayoutDashboard, href: '/dashboard',     label: 'Home' },
  { icon: PiggyBank,       href: '/savings-groups',label: 'My Groups' },
  { icon: Bell,            href: '/notifications', label: 'Activity' },
  { icon: User,            href: '/profile',       label: 'Profile' },
];

const fabActions = [
  { icon: PiggyBank, label: 'Create Group',  color: '#2EAF6F', href: '/savings-groups/create' },
  { icon: UserPlus,  label: 'Invite Member', color: '#F59E0B', href: '/savings-groups' },
];

// ─── NavLink — module-level so React sees a stable component type across renders.
// Defining components inside another component body creates a new function
// reference on every render; React treats it as a different component type,
// unmounts the old subtree, and remounts from scratch — destroying the SSR'd
// DOM and triggering hydration error #418.
interface NavLinkProps {
  item: { icon: typeof LayoutDashboard; label: string; href: string };
  pathname: string;
  onNavigate: () => void;
}

function NavLink({ item, pathname, onNavigate }: NavLinkProps) {
  const active = pathname === item.href;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200 group"
      style={{
        background: active ? 'rgba(46,175,111,0.15)' : 'transparent',
        color: active ? '#2EAF6F' : 'rgba(255,255,255,0.6)',
      }}
    >
      <item.icon size={17} style={{ color: active ? '#2EAF6F' : 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
      <span className="truncate">{item.label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#2EAF6F' }} />}
    </Link>
  );
}

// ─── Sidebar — module-level for the same reason as NavLink above.
interface SidebarProps {
  pathname: string;
  onNavigate: () => void;
  userName: string;
  userInitial: string;
  userTrust: number;
  isGroupLeader: boolean;
}

function Sidebar({ pathname, onNavigate, userName, userInitial, userTrust, isGroupLeader }: SidebarProps) {
  return (
    <aside className="flex flex-col h-full"
      style={{ background: 'linear-gradient(180deg, #0F172A 0%, #1A1A2E 100%)', borderRight: '1px solid rgba(255,255,255,0.07)' }}>

      {/* Logo + close (mobile) */}
      <div className="flex items-center justify-between px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <Link to="/" onClick={onNavigate}>
          <img src="/airo-assets/images/logo/horizontal" alt="PadiHub" className="r-logo" style={{ flexShrink: 0 }} />
        </Link>
        <button onClick={onNavigate}
          className="dash-sidebar-close flex lg:hidden items-center justify-center"
          style={{ padding: 6, borderRadius: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
          <X size={18} />
        </button>
      </div>

      {/* Trust Score pill */}
      <div className="px-4 pt-4 pb-2">
        <Link to="/trust" onClick={onNavigate}
          className="rounded-2xl p-3 flex items-center gap-3 transition-all hover:bg-white/5"
          style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.18)' }}>
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>{userInitial}</div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{userName}</p>
            <p className="text-xs font-semibold" style={{ color: '#2EAF6F' }}>Trust Score™ {userTrust}</p>
          </div>
          <Shield size={13} style={{ color: '#2EAF6F', flexShrink: 0 }} />
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto space-y-0.5">
        <p className="text-xs font-bold uppercase tracking-widest px-4 py-2" style={{ color: 'rgba(255,255,255,0.22)' }}>Main</p>
        {mainNav.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}

        <p className="text-xs font-bold uppercase tracking-widest px-4 pt-4 pb-2" style={{ color: 'rgba(255,255,255,0.22)' }}>My Score</p>
        {identityNav.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}

        <p className="text-xs font-bold uppercase tracking-widest px-4 pt-4 pb-2" style={{ color: 'rgba(255,255,255,0.22)' }}>Account</p>
        {communityNav.map(item => <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />)}
      </nav>

      {/* Bottom — leader tools link, only for users who actually lead a group */}
      {isGroupLeader && (
        <div className="px-3 py-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <NavLink item={{ icon: LayoutGrid, label: 'Manage Group', href: '/leader-dashboard' }} pathname={pathname} onNavigate={onNavigate} />
        </div>
      )}
    </aside>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [fabOpen, setFabOpen]           = useState(false);
  const [searchOpen, setSearchOpen]     = useState(false);
  const [quickOpen, setQuickOpen]       = useState(false);
  const [profileOpen, setProfileOpen]   = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const quickRef  = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const dashUser = useDashboardUser();

  // Redirect to login if the session's JWT has already expired — otherwise
  // the dashboard keeps rendering as "logged in" indefinitely with no
  // re-authentication, since localStorage never expires on its own.
  useEffect(() => {
    if (!getValidSession()) {
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  // Close quick actions / profile menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 50);
  }, [searchOpen]);

  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate('/', { replace: true });
  };

  const quickActions = [
    { icon: PiggyBank, label: 'Create Group',     href: '/savings-groups/create', color: '#2EAF6F' },
    { icon: UserPlus,  label: 'Invite Member',    href: '/savings-groups', color: '#F59E0B' },
    ...(dashUser.isGroupLeader ? [{ icon: LayoutGrid, label: 'Manage Group', href: '/leader-dashboard', color: '#EF4444' }] : []),
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#F9FAFB' }}>

      {/* Desktop sidebar — hidden below lg (1024px), flex above.
          Always in DOM so SSR and first client render are identical — no hydration mismatch. */}
      <div className="hidden lg:flex flex-col flex-shrink-0" style={{ width: 256 }}>
        <Sidebar pathname={location.pathname} onNavigate={closeSidebar} userName={dashUser.name} userInitial={dashUser.initial} userTrust={dashUser.trust} isGroupLeader={dashUser.isGroupLeader} />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
          <div style={{ width: 288, flexShrink: 0, display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' }}>
            <Sidebar pathname={location.pathname} onNavigate={closeSidebar} userName={dashUser.name} userInitial={dashUser.initial} userTrust={dashUser.trust} isGroupLeader={dashUser.isGroupLeader} />
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={closeSidebar} />
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* ── Top header ── */}
        <header style={{ height: 64, display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', background: '#fff', borderBottom: '1px solid #F3F4F6', flexShrink: 0, zIndex: 30, position: 'sticky', top: 0 }}>

          {/* Mobile menu toggle — visible below lg (1024px), hidden above */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex lg:hidden items-center justify-center"
            style={{ padding: 8, borderRadius: 12, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
            aria-label="Open menu"
          >
            <Menu size={20} style={{ color: '#4B5563' }} />
          </button>

          {/* Search bar */}
          <div className="flex-1 max-w-md">
            {searchOpen ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-gray-200 bg-gray-50 focus-within:border-green-400 focus-within:bg-white transition-all">
                <Search size={15} className="text-gray-400 flex-shrink-0" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search communities, members, groups…"
                  className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
                  onBlur={() => setSearchOpen(false)}
                />
                <button onClick={() => setSearchOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300 transition-all text-sm text-gray-400 w-full max-w-xs"
              >
                <Search size={15} />
                <span className="hidden sm:inline">Search…</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto flex-shrink-0">

            {/* Subscription status badge */}
            {dashUser.tier && (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}>
                <Zap size={11} fill="#2EAF6F" />
                <span>
                  {dashUser.tier === 'premium' ? 'Premium' : 'Basic'}
                  {dashUser.country ? ` · ${dashUser.country === 'NG' ? 'NG' : 'UK'}` : ''}
                  {typeof dashUser.groupsJoinedCount === 'number' && typeof dashUser.groupsJoinedLimit === 'number'
                    ? ` · ${dashUser.groupsJoinedCount} of ${dashUser.groupsJoinedLimit} groups joined`
                    : ''}
                </span>
              </div>
            )}

            {/* Quick Actions */}
            <div className="relative" ref={quickRef}>
              <button
                onClick={() => setQuickOpen(o => !o)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-2xl text-sm font-bold transition-all hover:bg-gray-100"
                style={{ color: '#1A1A2E' }}
                aria-label="Quick actions"
              >
                <Plus size={15} />
                <span className="hidden md:inline">Quick Actions</span>
                <ChevronDown size={13} className={`transition-transform ${quickOpen ? 'rotate-180' : ''}`} />
              </button>

              {quickOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50">
                  {quickActions.map(a => (
                    <Link key={a.label} to={a.href}
                      onClick={() => setQuickOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm font-semibold text-gray-700">
                      <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${a.color}15` }}>
                        <a.icon size={14} style={{ color: a.color }} />
                      </div>
                      {a.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Notifications */}
            <Link to="/notifications" className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors" aria-label="Notifications">
              <Bell size={20} className="text-gray-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: '#2EAF6F' }} />
            </Link>

            {/* Profile avatar + dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(o => !o)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', border: 'none', cursor: 'pointer' }}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                {dashUser.initial}
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50" role="menu">
                  {dashUser.name && (
                    <div className="px-4 py-2 mb-1 border-b border-gray-50">
                      <p className="text-sm font-bold text-gray-900 truncate">{dashUser.name}</p>
                    </div>
                  )}
                  <Link to="/profile" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm font-semibold text-gray-700">
                    <User size={15} className="text-gray-400" /> Profile
                  </Link>
                  <Link to="/settings" onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm font-semibold text-gray-700">
                    <Settings size={15} className="text-gray-400" /> Settings
                  </Link>
                  <button
                    onClick={handleLogout}
                    data-testid="dashboard-logout-button"
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-sm font-semibold text-red-500 w-full text-left"
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <LogOut size={15} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content — pb clears mobile bottom nav + safe area on phones */}
        <main
          className="pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0"
          style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', minWidth: 0 }}
        >
          {children}
        </main>

        {/* ── Mobile bottom nav — visible below lg (1024px), hidden above ── */}
        <nav className="flex lg:hidden" style={{ alignItems: 'center', justifyContent: 'space-around', height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)', background: '#fff', borderTop: '1px solid #F3F4F6', flexShrink: 0, zIndex: 30 }}>
            {mobileBottomNav.map(({ icon: Icon, href, label }) => {
              const active = location.pathname === href;
              return (
                <Link key={href} to={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '8px 12px', minWidth: 0, textDecoration: 'none' }}>
                  <Icon size={20} style={{ color: active ? '#2EAF6F' : '#9CA3AF' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: active ? '#2EAF6F' : '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</span>
                </Link>
              );
            })}
          </nav>
      </div>

      {/* ── FAB — visible below lg (1024px), hidden above ── */}
      <div className="flex lg:hidden" style={{ position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', right: 16, zIndex: 40, flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        {fabOpen && (
          <>
            {fabActions.map((action, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: action.color, boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
                  {action.label}
                </span>
                <Link to={action.href} aria-label={action.label}
                  style={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: action.color, boxShadow: '0 2px 12px rgba(0,0,0,0.2)' }}
                  onClick={() => setFabOpen(false)}>
                  <action.icon size={18} style={{ color: '#fff' }} />
                </Link>
              </div>
            ))}
          </>
        )}
        <button
          onClick={() => setFabOpen(o => !o)}
          style={{ width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(46,175,111,0.45)' }}
          aria-label="Quick actions"
        >
          <Plus size={24} style={{ color: '#fff', transform: fabOpen ? 'rotate(45deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* FAB backdrop — only shown when fab is open, hidden above lg */}
      {fabOpen && (
        <div className="flex lg:hidden" style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,0.2)', backdropFilter: 'blur(4px)' }} onClick={() => setFabOpen(false)} />
      )}
    </div>
  );
}
