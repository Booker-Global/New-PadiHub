import { Helmet } from '@dr.pogodin/react-helmet';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Camera, CheckCircle, ChevronRight, Edit,
  Eye, Globe, Lock, LogOut, Palette, Settings,
  Shield, Trash2, TrendingUp, User, Users, CreditCard,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { SuccessToast, useSuccessToast } from '@/components/ui/success-toast';
import { getValidSession, logout, readStoredSession } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 14 }, visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

const quickActions = [
  { label: 'Edit Profile', icon: Edit, color: '#2EAF6F', link: '/profile/edit' },
  { label: 'Find Groups', icon: Users, color: '#2EAF6F', link: '/groups/search' },
  { label: 'Trust Score™', icon: Shield, color: '#8B5CF6', link: '/trust' },
  { label: 'Payments', icon: CreditCard, color: '#EF4444', link: '/payments/methods' },
  { label: 'Notifications', icon: Bell, color: '#2eafaf', link: '/notifications' },
  { label: 'Settings', icon: Settings, color: '#F59E0B', link: '/settings' },
];

const defaultNotifications = {
  contributions: true,
  groupActivity: true,
  invitations: true,
  voting: false,
  email: true,
};

const defaultPrivacy = {
  showTrust: true,
  publicProfile: true,
};

type NotificationSettings = typeof defaultNotifications;
type PrivacySettings = typeof defaultPrivacy;

type UserProfile = {
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  country?: string | null;
  currency?: string | null;
  trust_score?: number | null;
  account_status?: string | null;
  subscription_status?: string | null;
  subscription_tier?: 'basic' | 'premium' | null;
  email_verified?: boolean | null;
  identity_verified?: boolean | null;
  notification_preferences?: Record<string, unknown> | null;
};

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getBooleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && isRecord(payload.errors)) {
    for (const value of Object.values(payload.errors)) {
      if (Array.isArray(value)) {
        const message = value.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
        if (message) return message;
      }
    }
  }

  if (isRecord(payload) && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }

  return fallback;
}

function getNotificationSettings(preferences: Record<string, unknown>): NotificationSettings {
  const source = isRecord(preferences.notifications) ? preferences.notifications : {};

  return {
    contributions: getBooleanValue(source.contributions, defaultNotifications.contributions),
    groupActivity: getBooleanValue(source.groupActivity, defaultNotifications.groupActivity),
    invitations: getBooleanValue(source.invitations, defaultNotifications.invitations),
    voting: getBooleanValue(source.voting, defaultNotifications.voting),
    email: getBooleanValue(source.email, defaultNotifications.email),
  };
}

function getPrivacySettings(preferences: Record<string, unknown>): PrivacySettings {
  const source = isRecord(preferences.privacy) ? preferences.privacy : {};

  return {
    showTrust: getBooleanValue(source.showTrust, defaultPrivacy.showTrust),
    publicProfile: getBooleanValue(source.publicProfile, defaultPrivacy.publicProfile),
  };
}

function getDisplayName(profile: UserProfile) {
  return profile.display_name?.trim()
    || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
    || profile.email?.split('@')[0]
    || 'Your Profile';
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

function formatCountry(code?: string | null) {
  switch (code) {
    case 'GB':
      return 'United Kingdom';
    case 'NG':
      return 'Nigeria';
    case 'GH':
      return 'Ghana';
    case 'KE':
      return 'Kenya';
    case 'ZA':
      return 'South Africa';
    case 'CA':
      return 'Canada';
    case 'US':
      return 'United States';
    default:
      return code || 'Not set';
  }
}

function humanizeStatus(value?: string | null) {
  if (!value) return 'Not set';
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getFallbackProfile(): UserProfile {
  const session = readStoredSession();
  return {
    display_name: session?.name || '',
    email: session?.email || '',
    trust_score: session?.trust ?? 0,
  };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(getFallbackProfile());
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const [signingOut, setSigningOut] = useState(false);
  const { toastState, show: showToast, hide: hideToast } = useSuccessToast();

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const session = getValidSession();
      if (!session?.token) {
        if (!active) return;
        const message = 'Your session has expired. Please sign in again.';
        setLoadError(message);
        setLoading(false);
        showToast('Could not load profile', message, 'badge');
        return;
      }

      try {
        const response = await globalThis.fetch('/api/users/profile', {
          headers: {
            Authorization: 'Bearer ' + session.token,
          },
        });

        const payload = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
        if (!response.ok || !payload?.success || !payload.data) {
          throw new Error(getApiErrorMessage(payload, 'Unable to load your profile right now.'));
        }

        if (!active) return;
        const nextProfile = payload.data;
        const nextPreferences = isRecord(nextProfile.notification_preferences)
          ? nextProfile.notification_preferences
          : {};

        setProfile(nextProfile);
        setPreferences(nextPreferences);
        setLoadError(null);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error && error.message
          ? error.message
          : 'Unable to load your profile right now.';
        setLoadError(message);
        showToast('Could not load profile', message, 'badge');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [showToast]);

  const notifications = useMemo(() => getNotificationSettings(preferences), [preferences]);
  const privacy = useMemo(() => getPrivacySettings(preferences), [preferences]);
  const avatarDataUrl = typeof preferences.avatarDataUrl === 'string' ? preferences.avatarDataUrl : null;
  const profileName = getDisplayName(profile);
  const initials = getInitials(profileName);
  const country = formatCountry(profile.country);
  const currency = profile.currency || 'Not set';
  const accountStatus = humanizeStatus(profile.account_status);
  const isActivelySubscribed = profile.subscription_status === 'active' || profile.subscription_status === 'trial';
  const subscriptionTierLabel = isActivelySubscribed && profile.subscription_tier
    ? humanizeStatus(profile.subscription_tier)
    : 'Unsubscribed';

  const achievements = [
    {
      title: profile.email_verified ? 'Email Verified' : 'Email Pending',
      color: profile.email_verified ? '#2EAF6F' : '#F59E0B',
      icon: CheckCircle,
    },
    {
      title: profile.identity_verified ? 'Identity Verified' : 'Identity Pending',
      color: profile.identity_verified ? '#2eafaf' : '#9CA3AF',
      icon: Shield,
    },
    {
      title: subscriptionTierLabel,
      color: isActivelySubscribed ? '#8B5CF6' : '#9CA3AF',
      icon: TrendingUp,
    },
  ];

  const accountSections = [
    {
      title: 'Profile',
      icon: User,
      color: '#2EAF6F',
      items: [
        { label: 'Display Name', value: profileName, link: '/profile/edit' },
        { label: 'Email', value: profile.email || 'Not set', link: '/profile/edit' },
        { label: 'Phone Number', value: profile.phone_number || 'Not set', link: '/profile/edit' },
      ],
    },
    {
      title: 'Privacy',
      icon: Eye,
      color: '#8B5CF6',
      items: [
        { label: 'Show Trust Score™', value: privacy.showTrust ? 'On' : 'Off', link: '/settings' },
      ],
    },
    {
      title: 'Notifications',
      icon: Bell,
      color: '#F59E0B',
      items: [
        { label: 'Email Notifications', value: notifications.email ? 'On' : 'Off', link: '/settings' },
        { label: 'Group Activity', value: notifications.groupActivity ? 'On' : 'Off', link: '/settings' },
      ],
    },
    {
      title: 'Region',
      icon: Palette,
      color: '#2eafaf',
      items: [
        { label: 'Country', value: country, link: '/profile/edit' },
        { label: 'Currency', value: currency, link: '/profile/edit' },
      ],
    },
    {
      title: 'Security',
      icon: Lock,
      color: '#EF4444',
      items: [
        { label: 'Account Status', value: accountStatus, link: '/profile/edit' },
        { label: 'Subscription', value: subscriptionTierLabel, link: '/subscription/manage' },
      ],
    },
  ];

  const handleSignOut = () => {
    if (signingOut) return;

    setSigningOut(true);
    void (async () => {
      await logout();
      navigate('/login', { replace: true });
    })().finally(() => {
      setSigningOut(false);
    });
  };

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
        <title>Personal Control Centre — PadiHub</title>
        <meta name="description" content="Manage your PadiHub profile, subscription, privacy and account settings." />
        <link rel="canonical" href="https://padihub.com/profile" />
        <meta property="og:title" content="Personal Control Centre — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub profile, subscription, privacy and account settings." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Personal Control Centre</h1>
              <p className="text-gray-500 text-sm mt-1">Manage your identity, settings and preferences.</p>
            </div>
            <Link to="/profile/edit" className="flex items-center gap-2 px-3 sm:px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              <Edit size={14} /> <span className="hidden sm:inline">Edit Profile</span><span className="sm:hidden">Edit</span>
            </Link>
          </MotionDiv>

          {loadError && (
            <MotionDiv variants={fadeUp} className="mb-5">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Unable to refresh your full profile</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-3xl opacity-15" style={{ background: '#2EAF6F' }} />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />

            <div className="relative flex items-center gap-4">
              <div className="relative flex-shrink-0">
                {avatarDataUrl ? (
                  <img src={avatarDataUrl} alt={`${profileName} avatar`} className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover" />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center font-black text-2xl sm:text-3xl text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 30px rgba(46,175,111,0.4)' }}>
                    {initials}
                  </div>
                )}
                <Link to="/profile/edit" className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center" style={{ background: '#2EAF6F', border: '2px solid #1A1A2E' }}>
                  <Camera size={12} color="#fff" />
                </Link>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-white mb-0.5 truncate" style={{ fontFamily: 'Nunito, sans-serif' }}>{profileName}</h2>
                <p className="text-xs sm:text-sm mb-2 truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{profile.email || 'No email available'}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F' }}>
                    {profile.email_verified || profile.identity_verified ? '✓ Verified' : 'Verification pending'}
                  </span>
                  <span className="hidden sm:inline text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                    {accountStatus}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative grid grid-cols-3 gap-2 sm:gap-3 mt-5">
              {[
                { label: 'Trust Score™', value: String(profile.trust_score ?? 0), color: '#2EAF6F' },
                { label: 'Country', value: country === 'Not set' ? '—' : country, color: '#F59E0B' },
                { label: 'Currency', value: currency === 'Not set' ? '—' : currency, color: '#8B5CF6' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl p-2 sm:p-3 text-center min-w-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <p className="text-sm sm:text-xl font-black truncate" style={{ color: item.color, fontFamily: 'Nunito, sans-serif' }} title={item.value}>{item.value}</p>
                  <p className="text-[10px] sm:text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.label}</p>
                </div>
              ))}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {quickActions.map((action) => (
              <Link key={action.label} to={action.link} className="rounded-2xl p-3 sm:p-4 text-center bg-white transition-all hover:-translate-y-0.5" style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2" style={{ background: `${action.color}12` }}>
                  <action.icon size={18} style={{ color: action.color }} />
                </div>
                <p className="text-xs font-bold text-gray-700 leading-tight">{action.label}</p>
              </Link>
            ))}
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>About Me</h2>
              <Link to="/profile/edit" className="text-xs font-bold" style={{ color: '#2EAF6F' }}>Edit</Link>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              {profileName} is managing their verified identity, account preferences, and community settings on PadiHub.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'email', value: profile.email },
                { key: 'phone', value: profile.phone_number },
                { key: 'country', value: country !== 'Not set' ? country : null },
                { key: 'currency', value: currency !== 'Not set' ? currency : null },
                { key: 'status', value: accountStatus },
              ].filter((tag): tag is { key: string; value: string } => Boolean(tag.value)).map((tag) => (
                <span key={tag.key} className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(46,175,111,0.08)', color: '#2EAF6F' }}>
                  {tag.value}
                </span>
              ))}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Achievements</h2>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {achievements.map((achievement) => (
                <div key={achievement.title} className="rounded-2xl p-3 text-center" style={{ background: `${achievement.color}10`, border: `1px solid ${achievement.color}20` }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-1.5" style={{ background: `linear-gradient(135deg, ${achievement.color}, ${achievement.color}cc)` }}>
                    <achievement.icon size={14} color="#fff" />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">{achievement.title}</p>
                </div>
              ))}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>My Savings Groups</h2>
              <Link to="/savings-groups" className="text-xs font-bold" style={{ color: '#2EAF6F' }}>View all →</Link>
            </div>
            <Link to="/savings-groups" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm flex-shrink-0" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                <Users size={18} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700">Manage your real savings groups</p>
                <p className="text-xs text-gray-400">Track live contributions, timelines, and milestones from the groups page.</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
            </Link>
          </MotionDiv>

          {accountSections.map((section) => (
            <MotionDiv key={section.title} variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${section.color}12` }}>
                  <section.icon size={15} style={{ color: section.color }} />
                </div>
                <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{section.title}</h2>
              </div>
              <div className="flex flex-col gap-1">
                {section.items.map((item) => (
                  <Link key={item.label} to={item.link} className="flex items-center justify-between p-3 rounded-2xl hover:bg-gray-50 transition-colors">
                    <p className="text-sm font-semibold text-gray-700">{item.label}</p>
                    <div className="flex items-center gap-2">
                      {item.value && <span className="text-xs text-gray-400">{item.value}</span>}
                      <ChevronRight size={14} className="text-gray-300" />
                    </div>
                  </Link>
                ))}
              </div>
            </MotionDiv>
          ))}

          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Subscription</h2>
            <div className="flex flex-col gap-2">
              <Link to="/subscription/manage" className="flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.1)' }}>
                  <TrendingUp size={15} style={{ color: '#2EAF6F' }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-700">{isActivelySubscribed ? 'Change Subscription Plan' : 'Choose Your Subscription Plan'}</p>
                  <p className="text-xs text-gray-400">
                    {isActivelySubscribed ? 'Switch between Basic and Premium — takes effect per our Terms & Conditions.' : 'Pick a plan to unlock creating and joining savings groups.'}
                  </p>
                </div>
              </Link>
              {isActivelySubscribed && (
                <Link to="/subscription/cancel" className="flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-red-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                    <Trash2 size={15} style={{ color: '#EF4444' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#EF4444' }}>Cancel Subscription</p>
                    <p className="text-xs text-gray-400">If you become fully unsubscribed, you'll be removed from your groups with email notice.</p>
                  </div>
                </Link>
              )}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-6 bg-white" style={{ border: '1px solid rgba(239,68,68,0.15)' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Account Actions</h2>
            <div className="flex flex-col gap-2">
              <button onClick={handleSignOut} disabled={signingOut} className="flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-gray-50 transition-colors disabled:opacity-60" type="button">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <LogOut size={15} style={{ color: '#F59E0B' }} />
                </div>
                <p className="text-sm font-bold text-gray-700">{signingOut ? 'Signing Out…' : 'Sign Out'}</p>
              </button>
              <Link to="/settings" className="flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-red-50 transition-colors">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)' }}>
                  <Trash2 size={15} style={{ color: '#EF4444' }} />
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#EF4444' }}>Delete Account</p>
                  <p className="text-xs text-gray-400">Go to settings to permanently remove your account and data</p>
                </div>
              </Link>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="flex flex-wrap justify-center gap-3">
            {[
              { label: 'Trust', color: '#2EAF6F', icon: Shield },
              { label: 'Transparency', color: '#2eafaf', icon: Globe },
              { label: 'Community', color: '#8B5CF6', icon: Users },
              { label: 'Progress', color: '#F59E0B', icon: TrendingUp },
            ].map((pill) => (
              <div key={pill.label} className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ background: `${pill.color}08`, border: `1px solid ${pill.color}20` }}>
                <pill.icon size={13} style={{ color: pill.color }} />
                <span className="text-xs font-bold text-gray-600">{pill.label}</span>
              </div>
            ))}
          </MotionDiv>
        </MotionDiv>
      </div>

      <SuccessToast {...toastState} onClose={hideToast} />
    </DashboardLayout>
  );
}
