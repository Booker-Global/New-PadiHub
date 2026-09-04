import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell, Camera, CheckCircle, ChevronLeft, ChevronRight, Globe, Mail, Shield, Sparkles, User,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { MotionDiv } from '@/lib/motion-safe';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { SuccessToast, useSuccessToast } from '@/components/ui/success-toast';
import { getValidSession, updateStoredSession } from '@/lib/session';

const steps = [
  { id: 1, title: 'Profile Photo', icon: Camera, color: '#2EAF6F' },
  { id: 2, title: 'Personal Info', icon: User, color: '#8B5CF6' },
  { id: 3, title: 'Profile Summary', icon: Sparkles, color: '#F59E0B' },
  { id: 4, title: 'Location', icon: Globe, color: '#2eafaf' },
  { id: 5, title: 'Notifications', icon: Bell, color: '#F59E0B' },
  { id: 6, title: 'Privacy', icon: Shield, color: '#EF4444' },
  { id: 7, title: 'Review', icon: Sparkles, color: '#2EAF6F' },
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
  subscription_status_display?: string | null;
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

const notificationItems: Array<{ key: keyof NotificationSettings; label: string; desc: string }> = [
  { key: 'contributions', label: 'Contribution reminders', desc: 'Before your contributions are due' },
  { key: 'groupActivity', label: 'Community updates', desc: 'Activity in your communities' },
  { key: 'invitations', label: 'Invitations', desc: 'When you are invited into new groups' },
  { key: 'voting', label: 'Governance votes', desc: 'New proposals and vote reminders' },
  { key: 'email', label: 'Email updates', desc: 'Receive updates in your inbox' },
];

const privacyItems: Array<{ key: keyof PrivacySettings; label: string; desc: string }> = [
  { key: 'publicProfile', label: 'Public profile', desc: 'Allow members to find your profile' },
  { key: 'showTrust', label: 'Show Trust Score™', desc: 'Visible to other group members' },
];

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

function sanitizeProfilePreferences(preferences: Record<string, unknown>) {
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

function Toggle({ on, onChange }: { on: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative w-10 h-5 rounded-full transition-all flex-shrink-0"
      style={{ background: on ? '#2EAF6F' : '#D1D5DB' }}
      type="button"
    >
      <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: on ? '22px' : '2px' }} />
    </button>
  );
}

export default function EditProfilePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [step, setStep] = useState(1);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [existingPreferences, setExistingPreferences] = useState<Record<string, unknown>>({});
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('Not set');
  const [currency, setCurrency] = useState('Not set');
  const [trustScore, setTrustScore] = useState(0);
  const [accountStatus, setAccountStatus] = useState('Not set');
  const [subscriptionStatus, setSubscriptionStatus] = useState('Not set');
  const [emailVerified, setEmailVerified] = useState(false);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettings>(defaultNotifications);
  const [privacy, setPrivacy] = useState<PrivacySettings>(defaultPrivacy);
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

        const profile = payload.data;
        const preferences = isRecord(profile.notification_preferences)
          ? profile.notification_preferences
          : {};

        setExistingPreferences(sanitizeProfilePreferences(preferences));
        setDisplayName(getDisplayName(profile));
        setPhoneNumber(profile.phone_number ?? '');
        setEmail(profile.email ?? '');
        setCountry(formatCountry(profile.country));
        setCurrency(profile.currency ?? 'Not set');
        setTrustScore(profile.trust_score ?? 0);
        setAccountStatus(humanizeStatus(profile.account_status));
        setSubscriptionStatus(profile.subscription_status_display || humanizeStatus(profile.subscription_status));
        setEmailVerified(Boolean(profile.email_verified));
        setIdentityVerified(Boolean(profile.identity_verified));
        setAvatarDataUrl(typeof preferences.avatarDataUrl === 'string' ? preferences.avatarDataUrl : null);
        setNotifications(getNotificationSettings(preferences));
        setPrivacy(getPrivacySettings(preferences));
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

  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Could not upload photo', 'Please choose an image file.', 'badge');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('Could not upload photo', 'Please choose an image smaller than 5MB.', 'badge');
      return;
    }

    const reader = new globalThis.FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarDataUrl(reader.result);
      } else {
        showToast('Could not upload photo', 'The selected file could not be read.', 'badge');
      }
    };
    reader.onerror = () => {
      showToast('Could not upload photo', 'The selected file could not be read.', 'badge');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    const session = getValidSession();
    if (!session?.token) {
      showToast('Could not save profile', 'Your session has expired. Please sign in again.', 'badge');
      return;
    }

    if (!displayName.trim()) {
      showToast('Display name required', 'Please enter a display name before saving.', 'badge');
      return;
    }

    setSaving(true);

    const notificationPreferences: Record<string, unknown> = {
      ...sanitizeProfilePreferences(existingPreferences),
      notifications,
      privacy,
    };

    if (avatarDataUrl) {
      notificationPreferences.avatarDataUrl = avatarDataUrl;
    } else {
      delete notificationPreferences.avatarDataUrl;
    }

    try {
      const response = await globalThis.fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: displayName.trim(),
          phone_number: phoneNumber.trim(),
          notification_preferences: notificationPreferences,
        }),
      });

      const payload = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!response.ok || !payload?.success || !payload.data) {
        throw new Error(getApiErrorMessage(payload, 'Unable to save your profile right now.'));
      }

      const savedProfile = payload.data;
      const savedPreferences = isRecord(savedProfile.notification_preferences)
        ? sanitizeProfilePreferences(savedProfile.notification_preferences)
        : notificationPreferences;

      setExistingPreferences(savedPreferences);
      setDisplayName(getDisplayName(savedProfile));
      setPhoneNumber(savedProfile.phone_number ?? phoneNumber.trim());
      setAvatarDataUrl(typeof savedPreferences.avatarDataUrl === 'string' ? savedPreferences.avatarDataUrl : null);
      setNotifications(getNotificationSettings(savedPreferences));
      setPrivacy(getPrivacySettings(savedPreferences));
      updateStoredSession({
        name: getDisplayName(savedProfile),
        email: savedProfile.email ?? session.email,
      });
      setCompleted(true);
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : 'Unable to save your profile right now.';
      showToast('Could not save profile', message, 'badge');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step < steps.length) {
      setStep((current) => current + 1);
      return;
    }

    void handleSaveProfile();
  };

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  if (completed) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-lg mx-auto flex flex-col items-center justify-center min-h-96">
          <MotionDiv
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 40px rgba(46,175,111,0.4)' }}
          >
            <CheckCircle size={36} color="#fff" />
          </MotionDiv>
          <h2 className="text-2xl font-extrabold text-gray-900 text-center mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Profile Updated!</h2>
          <p className="text-gray-500 text-center mb-6">Your changes have been saved and will now survive reloads.</p>
          <div className="flex gap-3 w-full max-w-xs">
            <Link to="/profile" className="flex-1 py-3.5 rounded-2xl font-bold text-white text-center transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              View Profile
            </Link>
            <Link to="/settings" className="flex-1 py-3.5 rounded-2xl font-bold text-center hover:bg-gray-50 transition-colors" style={{ border: '1px solid #E5E7EB', color: '#6B7280' }}>
              Settings
            </Link>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const initials = getInitials(displayName || email || 'Your Profile');

  return (
    <DashboardLayout>
      <Helmet>
        <title>Edit Profile — PadiHub</title>
        <meta name="description" content="Update your PadiHub profile information." />
        <link rel="canonical" href="https://padihub.com/profile/edit" />
        <meta property="og:title" content="Edit Profile — PadiHub" />
        <meta property="og:description" content="Update your PadiHub profile information." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="p-4 sm:p-6 max-w-xl mx-auto">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

        <div className="flex items-center gap-3 mb-6">
          <Link to="/profile" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Edit Profile</h1>
            <p className="text-gray-500 text-sm">Step {step} of {steps.length}</p>
          </div>
        </div>

        {loadError && (
          <div className="mb-6">
            <Alert variant="destructive" className="rounded-2xl">
              <AlertTitle>Unable to load saved profile data</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex gap-1.5 mb-6">
          {steps.map((stepItem) => (
            <div key={stepItem.id} className="flex-1 h-1.5 rounded-full transition-all" style={{ background: stepItem.id <= step ? '#2EAF6F' : '#E5E7EB' }} />
          ))}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          {steps.map((stepItem) => (
            <button
              key={stepItem.id}
              onClick={() => setStep(stepItem.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all"
              style={{
                background: stepItem.id === step ? `${stepItem.color}12` : '#F3F4F6',
                border: stepItem.id === step ? `1.5px solid ${stepItem.color}` : '1.5px solid transparent',
                color: stepItem.id === step ? stepItem.color : stepItem.id < step ? '#2EAF6F' : '#9CA3AF',
              }}
              type="button"
            >
              {stepItem.id < step ? <CheckCircle size={11} style={{ color: '#2EAF6F' }} /> : <stepItem.icon size={11} />}
              {stepItem.title}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <MotionDiv key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }}>
            {step === 1 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Profile Photo</h2>
                <p className="text-sm text-gray-500 mb-6">Upload a profile image that will be stored securely in your saved profile preferences.</p>
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    {avatarDataUrl ? (
                      <img src={avatarDataUrl} alt="Profile preview" className="w-24 h-24 rounded-2xl object-cover" />
                    ) : (
                      <div className="w-24 h-24 rounded-2xl flex items-center justify-center font-black text-4xl text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 30px rgba(46,175,111,0.3)' }}>
                        {initials}
                      </div>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#2EAF6F', border: '2px solid #fff' }} type="button">
                      <Camera size={14} color="#fff" />
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => fileInputRef.current?.click()} className="px-5 py-2.5 rounded-2xl font-bold text-white text-sm transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }} type="button">
                      Upload Photo
                    </button>
                    <button onClick={() => setAvatarDataUrl(null)} disabled={!avatarDataUrl} className="px-5 py-2.5 rounded-2xl font-bold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50" style={{ background: '#F3F4F6', color: '#6B7280' }} type="button">
                      Remove Photo
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">JPG, PNG or GIF · Max 5MB</p>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Personal Information</h2>
                <p className="text-sm text-gray-500 mb-5">Update the profile details that are supported by your account API.</p>
                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Display Name</label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-gray-900 outline-none transition-all"
                      style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                      onFocus={(event) => { event.target.style.borderColor = '#2EAF6F'; }}
                      onBlur={(event) => { event.target.style.borderColor = '#E5E7EB'; }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Phone Number</label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(event) => setPhoneNumber(event.target.value)}
                      placeholder="Add a phone number"
                      className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-gray-900 outline-none transition-all"
                      style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}
                      onFocus={(event) => { event.target.style.borderColor = '#2EAF6F'; }}
                      onBlur={(event) => { event.target.style.borderColor = '#E5E7EB'; }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">Email</label>
                    <div className="w-full px-4 py-3 rounded-2xl text-sm font-semibold text-gray-500" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      {email || 'Not available'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Profile Summary</h2>
                <p className="text-sm text-gray-500 mb-5">Preview how your core profile details currently look.</p>
                <div className="rounded-3xl p-5 mb-4" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                  <div className="flex items-center gap-4">
                    {avatarDataUrl ? (
                      <img src={avatarDataUrl} alt="Profile preview" className="w-16 h-16 rounded-2xl object-cover" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-2xl text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                        {initials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="text-lg font-extrabold text-white truncate" style={{ fontFamily: 'Nunito, sans-serif' }}>{displayName || 'Your Profile'}</h3>
                      <p className="text-sm truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>{email || 'No email available'}</p>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{phoneNumber || 'No phone number added yet'}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { label: 'Trust Score™', value: String(trustScore), icon: Shield, color: '#2EAF6F' },
                    { label: 'Account Status', value: accountStatus, icon: Sparkles, color: '#8B5CF6' },
                    { label: 'Email Verification', value: emailVerified ? 'Verified' : 'Pending', icon: Mail, color: '#F59E0B' },
                    { label: 'Identity Verification', value: identityVerified ? 'Verified' : 'Pending', icon: User, color: '#2eafaf' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl p-4" style={{ background: '#F9FAFB' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <item.icon size={14} style={{ color: item.color }} />
                        <p className="text-xs font-bold text-gray-500">{item.label}</p>
                      </div>
                      <p className="text-sm font-extrabold text-gray-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Location</h2>
                <p className="text-sm text-gray-500 mb-5">Country and currency are currently read-only on this screen, but they are shown here from your real profile.</p>
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Country', value: country },
                    { label: 'Currency', value: currency },
                    { label: 'Subscription', value: subscriptionStatus },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-4 rounded-2xl" style={{ background: '#F9FAFB' }}>
                      <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                      <span className="text-sm font-bold text-gray-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 5 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Notification Preferences</h2>
                <p className="text-sm text-gray-500 mb-5">Choose what matters most to you.</p>
                <div className="flex flex-col gap-3">
                  {notificationItems.map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-400">{item.desc}</p>
                      </div>
                      <Toggle on={notifications[item.key]} onChange={(value) => setNotifications((current) => ({ ...current, [item.key]: value }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 6 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Privacy Settings</h2>
                <p className="text-sm text-gray-500 mb-5">Control who can see your profile and security status.</p>
                <div className="flex flex-col gap-3">
                  {privacyItems.map((item) => (
                    <div key={item.key} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-400">{item.desc}</p>
                      </div>
                      <Toggle on={privacy[item.key]} onChange={(value) => setPrivacy((current) => ({ ...current, [item.key]: value }))} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 7 && (
              <div className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
                <h2 className="font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Review Your Profile</h2>
                <p className="text-sm text-gray-500 mb-5">Everything looks good? Save your changes.</p>
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Display Name', value: displayName || 'Not set', color: '#2EAF6F' },
                    { label: 'Phone Number', value: phoneNumber || 'Not set', color: '#8B5CF6' },
                    { label: 'Country', value: country, color: '#2eafaf' },
                    { label: 'Notifications', value: notifications.email ? 'Configured' : 'Email updates off', color: '#F59E0B' },
                    { label: 'Privacy', value: privacy.publicProfile ? 'Public profile enabled' : 'Private profile', color: '#EF4444' },
                    { label: 'Photo', value: avatarDataUrl ? 'Ready to save' : 'Initials badge fallback', color: '#2EAF6F' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                      <p className="text-sm font-bold text-gray-700">{item.label}</p>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: item.color }}>{item.value}</span>
                        <CheckCircle size={14} style={{ color: item.color }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </MotionDiv>
        </AnimatePresence>

        <div className="flex flex-col-reverse sm:flex-row gap-3 mt-5">
          {step > 1 && (
            <button onClick={() => setStep((current) => current - 1)} className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors" style={{ border: '1px solid #E5E7EB' }} type="button">
              <ChevronLeft size={16} /> Back
            </button>
          )}
          <button onClick={handleNext} disabled={saving} className="w-full sm:flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-60" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }} type="button">
            {step === steps.length ? (saving ? 'Saving…' : 'Save Profile') : 'Continue'}
            {step < steps.length && <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      <SuccessToast {...toastState} onClose={hideToast} />
    </DashboardLayout>
  );
}
