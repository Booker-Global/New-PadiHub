import { Helmet } from '@dr.pogodin/react-helmet';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MotionDiv } from '@/lib/motion-safe';
import {
  Bell, Shield, Lock, Eye, ChevronRight, Check, Trash2, Download, LogOut,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { SuccessToast, useSuccessToast } from '@/components/ui/success-toast';
import { clearStoredSession, getValidSession, logout } from '@/lib/session';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };

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

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
};

type UserProfile = {
  notification_preferences?: Record<string, unknown> | null;
};

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
      style={{ background: value ? '#2EAF6F' : '#D1D5DB' }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: value ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function SettingRow({ icon: Icon, label, description, children, color = '#2EAF6F' }: {
  icon: typeof Bell;
  label: string;
  description?: string;
  children: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}12` }}>
          <Icon size={16} style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{label}</p>
          {description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

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

function sanitizeSettingsPreferences(preferences: Record<string, unknown>) {
  const nextPreferences = { ...preferences };
  delete nextPreferences.darkMode;
  delete nextPreferences.twoFA;
  if (isRecord(nextPreferences.privacy)) {
    const nextPrivacy = { ...nextPreferences.privacy };
    delete nextPrivacy.dataPreferences;
    nextPreferences.privacy = nextPrivacy;
  }
  if (isRecord(nextPreferences.notifications)) {
    const nextNotifications = { ...nextPreferences.notifications };
    delete nextNotifications.sms;
    nextPreferences.notifications = nextNotifications;
  }
  return nextPreferences;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState<NotificationSettings>(defaultNotifications);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultPrivacy);
  const [existingPreferences, setExistingPreferences] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
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
        showToast('Could not load settings', message, 'badge');
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
          throw new Error(getApiErrorMessage(payload, 'Unable to load your settings right now.'));
        }

        if (!active) return;

        const preferences = isRecord(payload.data.notification_preferences)
          ? payload.data.notification_preferences
          : {};

        setExistingPreferences(sanitizeSettingsPreferences(preferences));
        setNotifs(getNotificationSettings(preferences));
        setPrivacy(getPrivacySettings(preferences));
        setLoadError(null);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error && error.message
          ? error.message
          : 'Unable to load your settings right now.';
        setLoadError(message);
        showToast('Could not load settings', message, 'badge');
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, [showToast]);

  const handleSave = async () => {
    const session = getValidSession();
    if (!session?.token) {
      showToast('Could not save settings', 'Your session has expired. Please sign in again.', 'badge');
      return;
    }

    setSaving(true);

    const preferences = {
      ...sanitizeSettingsPreferences(existingPreferences),
      notifications: notifs,
      privacy,
    };

    try {
      const response = await globalThis.fetch('/api/users/preferences', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences }),
      });

      const payload = await response.json().catch(() => null) as ApiResponse<null> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to save your settings right now.'));
      }

      setExistingPreferences(preferences);
      showToast('Settings saved', 'Your preferences have been updated.', 'default');
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Unable to save your settings right now.';
      showToast('Could not save settings', message, 'badge');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setPasswordError('Your session has expired. Please sign in again.');
      return;
    }

    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('Please complete all password fields.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    if (passwordForm.currentPassword === passwordForm.newPassword) {
      setPasswordError('Your new password must be different from your current password.');
      return;
    }
    if (passwordForm.newPassword.length < 8 || !/[A-Z]/.test(passwordForm.newPassword) || !/[0-9]/.test(passwordForm.newPassword)) {
      setPasswordError('Use at least 8 characters, including 1 uppercase letter and 1 number.');
      return;
    }

    setPasswordSaving(true);
    setPasswordError(null);

    try {
      const response = await globalThis.fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          current_password: passwordForm.currentPassword,
          new_password: passwordForm.newPassword,
        }),
      });

      const payload = await response.json().catch(() => null) as ApiResponse<null> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to change your password right now.'));
      }

      clearStoredSession();
      navigate('/login', {
        replace: true,
        state: { notice: 'Password changed successfully. Please sign in again with your new password.' },
      });
    } catch (error) {
      setPasswordError(
        error instanceof Error && error.message
          ? error.message
          : 'Unable to change your password right now.',
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleExport = async () => {
    const session = getValidSession();
    if (!session?.token) {
      showToast('Could not export data', 'Your session has expired. Please sign in again.', 'badge');
      return;
    }

    setExporting(true);

    try {
      const response = await globalThis.fetch('/api/users/profile', {
        headers: {
          Authorization: 'Bearer ' + session.token,
        },
      });

      const payload = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(getApiErrorMessage(payload, 'Unable to export your data right now.'));
      }

      const blob = new globalThis.Blob([
        JSON.stringify({
          exportedAt: new Date().toISOString(),
          profile: payload.data,
        }, null, 2),
      ], { type: 'application/json' });

      const url = globalThis.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `padihub-profile-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      globalThis.URL.revokeObjectURL(url);

      showToast('Export ready', 'Your profile data has been downloaded.', 'default');
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Unable to export your data right now.';
      showToast('Could not export data', message, 'badge');
    } finally {
      setExporting(false);
    }
  };

  const handleLogoutConfirm = () => {
    setShowLogoutDialog(false);
    void (async () => {
      await logout();
      navigate('/login', { replace: true });
    })();
  };

  const handleDeleteConfirm = async () => {
    if (deletingAccount) return;

    const session = getValidSession();
    if (!session?.token) {
      const message = 'Your session has expired. Please sign in again.';
      setDeleteError(message);
      showToast('Could not delete account', message, 'badge');
      return;
    }

    setDeletingAccount(true);
    setDeleteError(null);

    try {
      const response = await globalThis.fetch('/api/users/profile', {
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer ' + session.token,
        },
      });

      const payload = await response.json().catch(() => null) as ApiResponse<null> | null;
      if (!response.ok || !payload?.success) {
        throw new Error(getApiErrorMessage(payload, 'Unable to delete your account right now.'));
      }

      setShowDeleteDialog(false);
      clearStoredSession();
      navigate('/', { replace: true });
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Unable to delete your account right now.';
      setDeleteError(message);
      showToast('Could not delete account', message, 'badge');
    } finally {
      setDeletingAccount(false);
    }
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
        <title>Settings — PadiHub</title>
        <meta name="description" content="Manage your PadiHub notification preferences, privacy settings, security and account options." />
        <link rel="canonical" href="https://padihub.com/settings" />
        <meta property="og:title" content="Settings — PadiHub" />
        <meta property="og:description" content="Manage your PadiHub notification preferences, privacy settings, security and account options." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>
          <MotionDiv variants={fadeUp} className="mb-8">
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Settings</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your preferences, privacy and security</p>
          </MotionDiv>

          {loadError && (
            <MotionDiv variants={fadeUp} className="mb-4">
              <Alert variant="destructive" className="rounded-2xl">
                <AlertTitle>Unable to load saved settings</AlertTitle>
                <AlertDescription>{loadError}</AlertDescription>
              </Alert>
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Notifications</h2>
            <p className="text-xs text-gray-400 mb-4">Choose what you want to be notified about</p>
            <SettingRow icon={Bell} label="Contribution reminders" description="Get reminded before contributions are due" color="#2EAF6F">
              <Toggle value={notifs.contributions} onChange={(value) => setNotifs((current) => ({ ...current, contributions: value }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Group activity" description="New members, payments and group updates" color="#2eafaf">
              <Toggle value={notifs.groupActivity} onChange={(value) => setNotifs((current) => ({ ...current, groupActivity: value }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Invitations" description="When you're invited to join a group" color="#8B5CF6">
              <Toggle value={notifs.invitations} onChange={(value) => setNotifs((current) => ({ ...current, invitations: value }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Voting & governance" description="New votes and voting deadlines" color="#F59E0B">
              <Toggle value={notifs.voting} onChange={(value) => setNotifs((current) => ({ ...current, voting: value }))} />
            </SettingRow>
            <SettingRow icon={Bell} label="Email notifications" description="Receive reminders and updates by email" color="#EF4444">
              <Toggle value={notifs.email} onChange={(value) => setNotifs((current) => ({ ...current, email: value }))} />
            </SettingRow>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Privacy</h2>
            <p className="text-xs text-gray-400 mb-4">Control what others can see about you</p>
            <SettingRow icon={Eye} label="Show Trust Score™" description="Visible to other group members" color="#2EAF6F">
              <Toggle value={privacy.showTrust} onChange={(value) => setPrivacy((current) => ({ ...current, showTrust: value }))} />
            </SettingRow>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-4" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Security</h2>
            <p className="text-xs text-gray-400 mb-4">Keep your account safe</p>
            <SettingRow icon={Shield} label="Change password" color="#8B5CF6">
              <span className="text-xs font-semibold text-gray-400">Requires current password</span>
            </SettingRow>
            <div className="grid gap-3 mt-2">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Current password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  onChange={(event) => {
                    setPasswordError(null);
                    setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }));
                  }}
                  className="w-full rounded-2xl px-4 py-3 text-sm"
                  style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">New password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.newPassword}
                    onChange={(event) => {
                      setPasswordError(null);
                      setPasswordForm((current) => ({ ...current, newPassword: event.target.value }));
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-sm"
                    style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm new password</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => {
                      setPasswordError(null);
                      setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }));
                    }}
                    className="w-full rounded-2xl px-4 py-3 text-sm"
                    style={{ border: '1px solid #E5E7EB', background: '#F9FAFB' }}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">Use at least 8 characters, including 1 uppercase letter and 1 number.</p>
              {passwordError && (
                <p className="text-sm" style={{ color: '#B91C1C' }}>{passwordError}</p>
              )}
              <button
                onClick={() => { void handlePasswordChange(); }}
                disabled={passwordSaving}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl font-bold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)' }}
                type="button"
              >
                <Lock size={16} />
                {passwordSaving ? 'Updating password…' : 'Change password'}
              </button>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <h2 className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Account</h2>
            <p className="text-xs text-gray-400 mb-4">Manage your account data</p>
            <SettingRow icon={Download} label="Export my data" description="Download a copy of all your PadiHub data" color="#2eafaf">
              <button
                className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-60"
                onClick={() => { void handleExport(); }}
                type="button"
                disabled={exporting}
              >
                {exporting ? 'Exporting…' : 'Export'} <ChevronRight size={14} />
              </button>
            </SettingRow>
            <SettingRow icon={LogOut} label="Sign out" description="Sign out of this device" color="#6B7280">
              <button onClick={() => setShowLogoutDialog(true)} className="flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors" type="button">
                Sign out <ChevronRight size={14} />
              </button>
            </SettingRow>
            <SettingRow icon={Trash2} label="Delete account" description="Permanently delete your account and all data" color="#EF4444">
              <button onClick={() => { setDeleteError(null); setShowDeleteDialog(true); }} className="text-sm font-semibold text-red-500 hover:text-red-700 transition-colors" type="button">
                Delete
              </button>
            </SettingRow>
          </MotionDiv>

          <MotionDiv variants={fadeUp}>
            <button
              onClick={() => { void handleSave(); }}
              disabled={saving}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}
            >
              <Check size={18} /> {saving ? 'Saving…' : 'Save all settings'}
            </button>
          </MotionDiv>
        </MotionDiv>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete your account?"
        description={deleteError
          ? `This will permanently delete your account, Trust Score™ and all group data. ${deleteError}`
          : 'This will permanently delete your account, Trust Score™ and all group data. This cannot be undone.'}
        confirmLabel={deletingAccount ? 'Deleting…' : 'Yes, delete'}
        cancelLabel="Keep my account"
        variant="danger"
        onConfirm={() => { void handleDeleteConfirm(); }}
        onCancel={() => {
          if (deletingAccount) return;
          setDeleteError(null);
          setShowDeleteDialog(false);
        }}
      />

      <ConfirmDialog
        open={showLogoutDialog}
        title="Sign out?"
        description="You'll need to sign back in to access your communities and savings groups."
        confirmLabel="Sign out"
        cancelLabel="Stay signed in"
        onConfirm={handleLogoutConfirm}
        onCancel={() => setShowLogoutDialog(false)}
      />

      <SuccessToast {...toastState} onClose={hideToast} />
    </DashboardLayout>
  );
}
