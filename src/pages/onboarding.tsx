import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Globe,
  Shield,
  Camera,
  Bell,
  Smartphone,
  Mail,
  Check,
  Star,
  Zap,
  Users,
  CreditCard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';

const STEPS = [
  'Welcome',
  'Country',
  'Subscription',
  'Payment Setup',
  'Photo',
  'Profile',
  'Interests',
  'Notifications',
  'Identity Verification',
  'Success',
];

const countryCards = [
  {
    key: 'UK',
    flag: '🇬🇧',
    name: 'United Kingdom',
    desc: 'Show UK pricing, billing guidance and Stripe Identity verification.',
    color: '#2EAF6F',
  },
  {
    key: 'NG',
    flag: '🇳🇬',
    name: 'Nigeria',
    desc: 'Show Nigerian pricing, billing guidance and Account Resolve bank-account validation steps.',
    color: '#F59E0B',
  },
] as const;

const defaultNotifications = {
  email: true,
  push: true,
  sms: false,
};

const planCards = {
  UK: [
    {
      key: 'basic',
      label: 'Basic',
      price: '£4.99',
      period: '/month',
      description: 'Best for members who want to join savings groups without creating their own.',
      limits: ['Cannot create a savings group', 'Join up to 3 groups'],
      accent: '#2EAF6F',
    },
    {
      key: 'premium',
      label: 'Premium',
      price: '£14.99',
      period: '/month',
      description: 'For members leading multiple circles and joining more communities.',
      limits: ['Create up to 3 savings groups', 'Join up to 5 more groups (8 total)'],
      accent: '#8B5CF6',
    },
  ],
  NG: [
    {
      key: 'basic',
      label: 'Basic',
      price: '₦5,000',
      period: '/month',
      description: 'Best for members who want to join savings groups without creating their own.',
      limits: ['Cannot create a savings group', 'Join up to 3 groups'],
      accent: '#2EAF6F',
    },
    {
      key: 'premium',
      label: 'Premium',
      price: '₦10,000',
      period: '/month',
      description: 'For members leading multiple circles and joining more communities.',
      limits: ['Create up to 3 savings groups', 'Join up to 5 more groups (8 total)'],
      accent: '#8B5CF6',
    },
  ],
} as const;

const interestOptions = [
  { label: 'Home Ownership', icon: '🏠' },
  { label: 'Travel & Holidays', icon: '✈️' },
  { label: 'Education', icon: '📚' },
  { label: 'Business', icon: '💼' },
  { label: 'Family Goals', icon: '👨‍👩‍👧' },
  { label: "Children's Future", icon: '🎓' },
  { label: 'Community Impact', icon: '🌍' },
  { label: 'Health & Wellness', icon: '🏥' },
  { label: 'Vehicle Purchase', icon: '🚗' },
  { label: 'Emergency Fund', icon: '💡' },
  { label: 'Events & Celebrations', icon: '🎉' },
  { label: 'Sustainable Living', icon: '🌱' },
  { label: 'Faith Community', icon: '🕊️' },
  { label: 'Professional Network', icon: '🤝' },
  { label: 'Diaspora Connection', icon: '🌐' },
  { label: 'Social Club', icon: '🎭' },
];

const communityTypes = ['Professional', 'Faith', 'Family', 'Social', 'Education', 'Business', 'Diaspora', 'Neighbourhood'];

type CountryKey = 'UK' | 'NG';
type CountryChoice = CountryKey | '';
type SubscriptionTierKey = 'basic' | 'premium';
type NotificationSettings = typeof defaultNotifications;

type UserProfile = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  display_name?: string | null;
  country?: string | null;
  email_verified?: boolean | null;
  identity_verified?: boolean | null;
  subscription_tier?: SubscriptionTierKey | null;
  payment_method_verified_at?: string | null;
  payout_verified_at?: string | null;
  notification_preferences?: Record<string, unknown> | null;
};

type IdentityStatus = {
  verified?: boolean;
  verifiedAt?: string;
  sessionId?: string;
  bypass_available?: boolean;
};

type ApiResponse<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[] | undefined>;
};

type SelectPlanResult = {
  tier?: SubscriptionTierKey;
  plan?: string;
  monthly_amount?: number;
  direction?: 'upgrade' | 'downgrade';
  effective_immediately?: boolean;
  effective_date?: string;
};

type OnboardingPreferences = {
  bio: string;
  location: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getBooleanValue(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function getStringValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

function mapCountryCode(value?: string | null): CountryChoice {
  if (value === 'GB') return 'UK';
  if (value === 'NG') return 'NG';
  return '';
}

function getCountryName(value: CountryChoice) {
  if (value === 'UK') return 'the United Kingdom';
  if (value === 'NG') return 'Nigeria';
  return 'your location';
}

function getDisplayName(profile: UserProfile) {
  return profile.display_name?.trim()
    || `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
    || profile.email?.split('@')[0]
    || '';
}

function getNotificationSettings(preferences: Record<string, unknown>): NotificationSettings {
  const source = isRecord(preferences.notifications) ? preferences.notifications : {};

  return {
    email: getBooleanValue(source.email, defaultNotifications.email),
    push: getBooleanValue(source.push, defaultNotifications.push),
    sms: getBooleanValue(source.sms, defaultNotifications.sms),
  };
}

function getOnboardingPreferences(preferences: Record<string, unknown>): OnboardingPreferences {
  const source = isRecord(preferences.onboarding) ? preferences.onboarding : {};

  return {
    bio: getStringValue(source.bio),
    location: getStringValue(source.location),
  };
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = (step / (total - 1)) * 100;
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
      <MotionDiv
        className="h-full rounded-full"
        style={{ background: 'linear-gradient(90deg, #2EAF6F, #F59E0B)' }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />
    </div>
  );
}

function OnboardingShell({ children, step, totalSteps }: { children: ReactNode; step: number; totalSteps: number }) {
  return (
    <div className="min-h-screen flex" style={{ background: '#F9FAFB' }}>
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}
      >
        <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-15" style={{ background: '#2EAF6F' }} />
        <div className="absolute bottom-0 left-0 w-64 h-64 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />
        <div className="relative">
          <img src="/airo-assets/images/logo/horizontal" alt="PadiHub" className="r-logo" />
        </div>
        <div className="relative">
          <div className="flex flex-col gap-6 mb-12">
            {[
              { icon: Shield, label: 'Trust Score™', desc: 'Build your community reputation', color: '#2EAF6F' },
              { icon: Globe, label: 'UK & Nigeria', desc: 'Tailored onboarding for both markets', color: '#2eafaf' },
              { icon: Users, label: 'Savings Groups', desc: 'Save together, grow together', color: '#8B5CF6' },
            ].map((feature) => (
              <div key={feature.label} className="flex items-center gap-4">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${feature.color}20`, border: `1px solid ${feature.color}30` }}
                >
                  <feature.icon size={20} style={{ color: feature.color }} />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{feature.label}</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <blockquote className="border-l-2 pl-4" style={{ borderColor: '#2EAF6F' }}>
            <p className="text-gray-300 text-sm italic leading-relaxed">
              "PadiHub transformed how our community saves together. The Trust Score™ keeps everyone accountable."
            </p>
            <footer className="mt-2 text-xs font-semibold" style={{ color: '#2EAF6F' }}>— Amara O., Lagos Savers Circle</footer>
          </blockquote>
        </div>
        <p className="text-xs relative" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © 2026 PadiHub · Trust · Transparency · Community · Progress
        </p>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="lg:hidden flex items-center justify-center pt-8 pb-4">
          <img src="/airo-assets/images/logo/horizontal" alt="PadiHub" className="r-logo" />
        </div>

        <div className="px-6 lg:px-12 pt-6 lg:pt-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Step {step} of {totalSteps - 1}
            </span>
            <span className="text-xs font-bold" style={{ color: '#2EAF6F' }}>
              {Math.round(((step - 1) / (totalSteps - 2)) * 100)}% complete
            </span>
          </div>
          <ProgressBar step={step - 1} total={totalSteps - 1} />
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 lg:px-12 py-8 max-w-lg w-full mx-auto lg:mx-0">
          {children}
        </div>
      </div>
    </div>
  );
}

const slideVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -30, transition: { duration: 0.2, ease: 'easeIn' as const } },
};

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [country, setCountry] = useState<CountryChoice>('');
  const [accountCountry, setAccountCountry] = useState<CountryChoice>('');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionTierKey | ''>('');
  const [savedPlan, setSavedPlan] = useState<SubscriptionTierKey | ''>('');
  const [savedAvatar, setSavedAvatar] = useState<string | null>(null);
  const [savedDisplayName, setSavedDisplayName] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [profile, setProfile] = useState({ displayName: '', bio: '', location: '' });
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [notifs, setNotifs] = useState<NotificationSettings>(defaultNotifications);
  const [existingPreferences, setExistingPreferences] = useState<Record<string, unknown>>({});
  const [identityVerified, setIdentityVerified] = useState(false);
  const [paymentMethodVerified, setPaymentMethodVerified] = useState(false);
  const [payoutVerified, setPayoutVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [planSaving, setPlanSaving] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [paymentRefreshLoading, setPaymentRefreshLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalSteps = STEPS.length;

  const syncProfileState = useCallback((loadedProfile: UserProfile) => {
    const preferences = isRecord(loadedProfile.notification_preferences)
      ? loadedProfile.notification_preferences
      : {};
    const onboardingPreferences = getOnboardingPreferences(preferences);
    const avatar = typeof preferences.avatarDataUrl === 'string' ? preferences.avatarDataUrl : null;
    const displayName = loadedProfile.display_name?.trim() ?? '';

    setExistingPreferences(preferences);
    setSavedAvatar(avatar);
    setPhotoPreview(avatar);
    setSavedDisplayName(displayName);
    setProfile({
      displayName: displayName || getDisplayName(loadedProfile),
      bio: onboardingPreferences.bio,
      location: onboardingPreferences.location,
    });
    setNotifs(getNotificationSettings(preferences));
    setSelectedPlan(loadedProfile.subscription_tier ?? '');
    setSavedPlan(loadedProfile.subscription_tier ?? '');
    setPaymentMethodVerified(Boolean(loadedProfile.payment_method_verified_at));
    setPayoutVerified(Boolean(loadedProfile.payout_verified_at));

    const resolvedAccountCountry = mapCountryCode(loadedProfile.country);
    setAccountCountry(resolvedAccountCountry);
    setCountry((current) => current || resolvedAccountCountry);
  }, []);

  const loadOnboardingState = useCallback(async (showSkeleton = true) => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to continue onboarding.');
      setLoading(false);
      return false;
    }

    if (showSkeleton) setLoading(true);
    setError('');

    try {
      const headers = { Authorization: 'Bearer ' + session.token };
      const [profileResponse, identityResponse, geoResponse] = await Promise.all([
        window.fetch('/api/users/profile', { headers }),
        window.fetch('/api/identity/status', { headers }),
        window.fetch('/api/geo').catch(() => null),
      ]);

      const [profileJson, identityJson, geoJson] = await Promise.all([
        profileResponse.json().catch(() => null) as Promise<ApiResponse<UserProfile> | null>,
        identityResponse.json().catch(() => null) as Promise<ApiResponse<IdentityStatus> | null>,
        geoResponse?.json().catch(() => null) as Promise<{ region?: string } | null> | undefined,
      ]);

      if (!profileResponse.ok || !profileJson?.data) {
        throw new Error(getErrorMessage(profileJson, 'Could not load your profile.'));
      }
      if (!identityResponse.ok) {
        throw new Error(getErrorMessage(identityJson, 'Could not load your identity status.'));
      }

      const loadedProfile = profileJson.data;

      syncProfileState(loadedProfile);
      setIdentityVerified(Boolean(identityJson?.data?.verified ?? loadedProfile.identity_verified));

      const geoCountry = geoJson?.region === 'UK' || geoJson?.region === 'NG'
        ? geoJson.region
        : '';
      setCountry((current) => current || mapCountryCode(loadedProfile.country) || geoCountry);

      return true;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load onboarding.');
      return false;
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [syncProfileState]);

  useEffect(() => {
    void loadOnboardingState();
  }, [loadOnboardingState]);

  useEffect(() => {
    setActionError('');
    setActionNotice('');
  }, [step]);

  const currentCountry = country || accountCountry || 'UK';
  const currentPlans = useMemo(() => planCards[currentCountry], [currentCountry]);
  const hasSavedNotifications = useMemo(() => isRecord(existingPreferences.notifications), [existingPreferences]);
  const paymentSetupComplete = paymentMethodVerified && payoutVerified;

  const toggleInterest = (label: string) => {
    setSelectedInterests((previous) => (
      previous.includes(label) ? previous.filter((value) => value !== label) : [...previous, label]
    ));
  };

  const toggleType = (value: string) => {
    setSelectedTypes((previous) => (
      previous.includes(value) ? previous.filter((entry) => entry !== value) : [...previous, value]
    ));
  };

  const isStepComplete = useCallback((stepIndex: number) => {
    switch (stepIndex) {
      case 2:
        return Boolean(savedPlan);
      case 3:
        return paymentSetupComplete;
      case 4:
        return Boolean(savedAvatar);
      case 5:
        return Boolean(savedDisplayName);
      case 7:
        return hasSavedNotifications;
      case 8:
        return identityVerified;
      default:
        return false;
    }
  }, [hasSavedNotifications, identityVerified, paymentSetupComplete, savedAvatar, savedDisplayName, savedPlan]);

  const nextStep = useCallback(() => {
    setStep((current) => {
      let next = current + 1;
      while (next < totalSteps - 1 && isStepComplete(next)) {
        next += 1;
      }
      return Math.min(next, totalSteps - 1);
    });
  }, [isStepComplete, totalSteps]);

  const prevStep = () => setStep((current) => Math.max(current - 1, 0));

  const buildProfilePreferences = useCallback((overrides?: {
    avatarDataUrl?: string | null;
    includeProfileDetails?: boolean;
  }) => {
    const nextPreferences: Record<string, unknown> = { ...existingPreferences };
    const avatarDataUrl = overrides?.avatarDataUrl;

    if (avatarDataUrl) {
      nextPreferences.avatarDataUrl = avatarDataUrl;
    } else if (overrides && 'avatarDataUrl' in overrides) {
      delete nextPreferences.avatarDataUrl;
    }

    if (overrides?.includeProfileDetails) {
      const currentOnboarding = isRecord(existingPreferences.onboarding)
        ? existingPreferences.onboarding
        : {};
      nextPreferences.onboarding = {
        ...currentOnboarding,
        bio: profile.bio.trim(),
        location: profile.location.trim(),
      };
    }

    return nextPreferences;
  }, [existingPreferences, profile.bio, profile.location]);

  const buildNotificationPreferences = useCallback(() => {
    const nextPreferences: Record<string, unknown> = { ...existingPreferences };
    const currentNotifications = isRecord(existingPreferences.notifications)
      ? existingPreferences.notifications
      : {};

    nextPreferences.notifications = {
      ...currentNotifications,
      email: notifs.email,
      push: notifs.push,
      sms: notifs.sms,
    };

    return nextPreferences;
  }, [existingPreferences, notifs.email, notifs.push, notifs.sms]);

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setActionError('Please choose an image file for your profile photo.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setActionError('Please choose an image smaller than 5MB.');
      return;
    }

    const reader = new globalThis.FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setActionError('');
        setPhotoPreview(reader.result);
      } else {
        setActionError('The selected photo could not be read. Please try another file.');
      }
    };
    reader.onerror = () => {
      setActionError('The selected photo could not be read. Please try another file.');
    };
    reader.readAsDataURL(file);
  };

  const handleCountryContinue = () => {
    if (!country) return;
    nextStep();
  };

  const handlePlanContinue = async () => {
    if (!selectedPlan) return;
    if (selectedPlan === savedPlan) {
      nextStep();
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before selecting a subscription plan.');
      return;
    }

    setPlanSaving(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/subscriptions/select-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.token,
        },
        body: JSON.stringify({ tier: selectedPlan }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<SelectPlanResult> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not save your subscription plan.'));
      }

      const savedTier = json?.data?.tier ?? selectedPlan;
      setSelectedPlan(savedTier);
      setSavedPlan(savedTier);

      const activePlan = currentPlans.find((plan) => plan.key === savedTier);
      setActionNotice(activePlan
        ? `${activePlan.label} selected. Billing starts once you add a verified payment method.`
        : 'Plan selected. Billing starts once you add a verified payment method.');
      nextStep();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Could not save your subscription plan.');
    } finally {
      setPlanSaving(false);
    }
  };

  const refreshIdentityStatus = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before checking your identity status.');
      return;
    }

    setIdentityLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/identity/status', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json().catch(() => null) as ApiResponse<IdentityStatus> | null;
      if (!response.ok) {
        throw new Error(getErrorMessage(json, 'Could not refresh your identity status.'));
      }

      const verified = Boolean(json?.data?.verified);
      setIdentityVerified(verified);
      if (verified) {
        setActionNotice('Identity verification confirmed. You can continue onboarding.');
      } else {
        setActionError('Your identity verification is still pending. Complete the verification flow and check again.');
      }
    } catch (refreshError) {
      setActionError(refreshError instanceof Error ? refreshError.message : 'Could not refresh your identity status.');
    } finally {
      setIdentityLoading(false);
    }
  }, []);

  const handlePhotoContinue = async () => {
    if (!photoPreview || photoPreview === savedAvatar) {
      nextStep();
      return;
    }

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before saving your photo.');
      return;
    }

    setPhotoSaving(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notification_preferences: buildProfilePreferences({ avatarDataUrl: photoPreview }),
        }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!response.ok || !json?.data) {
        throw new Error(getErrorMessage(json, 'Could not save your profile photo.'));
      }

      syncProfileState(json.data);
      nextStep();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Could not save your profile photo.');
    } finally {
      setPhotoSaving(false);
    }
  };

  const handleProfileContinue = async () => {
    const displayName = profile.displayName.trim();
    if (!displayName) return;

    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before saving your profile.');
      return;
    }

    setProfileSaving(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/users/profile', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: displayName,
          notification_preferences: buildProfilePreferences({
            avatarDataUrl: photoPreview,
            includeProfileDetails: true,
          }),
        }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!response.ok || !json?.data) {
        throw new Error(getErrorMessage(json, 'Could not save your profile.'));
      }

      syncProfileState(json.data);
      nextStep();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Could not save your profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleNotificationContinue = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before saving your notification preferences.');
      return;
    }

    setNotificationSaving(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/users/preferences', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ preferences: buildNotificationPreferences() }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<null> | null;
      if (!response.ok || !json?.success) {
        throw new Error(getErrorMessage(json, 'Could not save your notification preferences.'));
      }

      const nextPreferences = buildNotificationPreferences();
      setExistingPreferences(nextPreferences);
      nextStep();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Could not save your notification preferences.');
    } finally {
      setNotificationSaving(false);
    }
  };

  const refreshPaymentStatus = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setActionError('Please log in again before checking your payment setup.');
      return;
    }

    setPaymentRefreshLoading(true);
    setActionError('');
    setActionNotice('');

    try {
      const response = await window.fetch('/api/users/profile', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json().catch(() => null) as ApiResponse<UserProfile> | null;
      if (!response.ok || !json?.data) {
        throw new Error(getErrorMessage(json, 'Could not refresh your payment setup status.'));
      }

      syncProfileState(json.data);
      if (Boolean(json.data.payment_method_verified_at) && Boolean(json.data.payout_verified_at)) {
        setActionNotice('Payment method and payout destination are both ready.');
      } else {
        setActionError('Payment setup is still incomplete. Add a payment method and connect a payout destination, then refresh.');
      }
    } catch (refreshError) {
      setActionError(refreshError instanceof Error ? refreshError.message : 'Could not refresh your payment setup status.');
    } finally {
      setPaymentRefreshLoading(false);
    }
  }, [syncProfileState]);

  if (loading) {
    return (
      <OnboardingShell step={1} totalSteps={totalSteps}>
        <SkeletonPage />
      </OnboardingShell>
    );
  }

  if (error) {
    return (
      <OnboardingShell step={1} totalSteps={totalSteps}>
        <div className="rounded-3xl bg-white p-6 text-center" style={{ border: '1px solid #F3F4F6' }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(239,68,68,0.1)' }}>
            <AlertTriangle size={24} style={{ color: '#EF4444' }} />
          </div>
          <h1 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
            Couldn&apos;t load your onboarding
          </h1>
          <p className="text-sm text-gray-500 mb-5">{error}</p>
          <button
            onClick={() => void loadOnboardingState()}
            className="px-5 py-2.5 rounded-2xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
            type="button"
          >
            Try again
          </button>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <>
      <Helmet>
        <title>Set up your account — PadiHub</title>
        <meta name="description" content="Complete your PadiHub profile and start your community savings journey." />
        <link rel="canonical" href="https://padihub.com/onboarding" />
        <meta property="og:title" content="Set up your account — PadiHub" />
        <meta property="og:description" content="Complete your PadiHub profile and start your community savings journey." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">Set up your PadiHub account</h1>

      <OnboardingShell step={step + 1} totalSteps={totalSteps}>
        <AnimatePresence mode="wait">
          <MotionDiv key={step} variants={slideVariants} initial="enter" animate="center" exit="exit">
            {(actionError || actionNotice) && (
              <div
                className="rounded-2xl p-4 mb-6 flex items-start gap-3"
                style={{
                  background: actionError ? 'rgba(239,68,68,0.08)' : 'rgba(46,175,111,0.08)',
                  border: actionError ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(46,175,111,0.2)',
                }}
              >
                {actionError ? (
                  <AlertTriangle size={18} style={{ color: '#EF4444', flexShrink: 0 }} />
                ) : (
                  <CheckCircle size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                )}
                <p className="text-sm" style={{ color: actionError ? '#B91C1C' : '#166534' }}>{actionError || actionNotice}</p>
              </div>
            )}

            {step === 0 && (
              <div>
                <div
                  className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'linear-gradient(135deg, rgba(46,175,111,0.15), rgba(245,158,11,0.15))', border: '1px solid rgba(46,175,111,0.2)' }}
                >
                  <span className="text-4xl">🚀</span>
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 text-center mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Welcome to PadiHub™
                </h2>
                <p className="text-gray-500 text-center mb-8 leading-relaxed">
                  You&apos;re about to join a trusted community platform built for transparency, collaboration and growth.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Shield, title: 'Trust Score™', desc: 'Build your reputation', color: '#2EAF6F' },
                    { icon: Users, title: 'Savings Groups', desc: 'Save together', color: '#8B5CF6' },
                    { icon: Zap, title: 'Secure onboarding', desc: 'Plan, verify and get paid', color: '#2eafaf' },
                  ].map((feature) => (
                    <div key={feature.title} className="rounded-2xl p-4 text-left" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-2" style={{ background: `${feature.color}15` }}>
                        <feature.icon size={17} style={{ color: feature.color }} />
                      </div>
                      <p className="font-bold text-sm text-gray-900">{feature.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{feature.desc}</p>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={nextStep}
                  className="w-full rounded-2xl py-4 font-bold text-base gap-2"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}
                >
                  Let&apos;s get started <ArrowRight size={18} />
                </Button>
                <p className="text-center text-xs text-gray-400 mt-4">Takes about 3 minutes · Pick your plan before verification</p>
              </div>
            )}

            {step === 1 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Where are you joining from? 🌍
                </h2>
                <p className="text-gray-500 text-sm mb-8">We&apos;ll show you the right pricing and verification flow for your location.</p>

                <div className="flex flex-col gap-4 mb-5">
                  {countryCards.map((card) => (
                    <button
                      key={card.key}
                      onClick={() => setCountry(card.key)}
                      className="flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all"
                      style={{
                        borderColor: country === card.key ? card.color : '#E5E7EB',
                        background: country === card.key ? `${card.color}06` : '#fff',
                      }}
                      type="button"
                    >
                      <span className="text-4xl flex-shrink-0">{card.flag}</span>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{card.name}</p>
                        <p className="text-sm text-gray-500 mt-0.5">{card.desc}</p>
                      </div>
                      <div
                        className="w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{ borderColor: country === card.key ? card.color : '#D1D5DB', background: country === card.key ? card.color : 'transparent' }}
                      >
                        {country === card.key && <Check size={13} className="text-white" />}
                      </div>
                    </button>
                  ))}
                </div>

                {accountCountry && country && accountCountry !== country && (
                  <div className="rounded-2xl p-4 mb-8" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                    <p className="text-sm text-gray-700">
                      You can review onboarding for {getCountryName(country)}, but billing and verification still follow the country saved on your account today.
                    </p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button
                    onClick={handleCountryContinue}
                    disabled={!country}
                    className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    Continue <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Choose your membership 💳
                </h2>
                <p className="text-gray-500 text-sm mb-6">Select the plan you want recorded on your account before you verify your identity.</p>

                <div className="flex flex-col gap-4 mb-8">
                  {currentPlans.map((plan) => (
                    <button
                      key={plan.key}
                      onClick={() => setSelectedPlan(plan.key)}
                      className="relative p-5 rounded-2xl border-2 text-left transition-all"
                      style={{
                        borderColor: selectedPlan === plan.key ? '#2EAF6F' : '#E5E7EB',
                        background: selectedPlan === plan.key ? 'rgba(46,175,111,0.04)' : '#fff',
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{plan.label}</p>
                          <p className="text-xs text-gray-500 mt-1">{plan.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black" style={{ color: '#2EAF6F', fontFamily: 'Nunito, sans-serif' }}>{plan.price}</span>
                          <span className="text-gray-400 text-sm">{plan.period}</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {plan.limits.map((limit) => (
                          <div key={limit} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <CheckCircle size={11} style={{ color: plan.accent, flexShrink: 0 }} /> {limit}
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <CheckCircle size={11} style={{ color: plan.accent, flexShrink: 0 }} /> Monthly billing only
                        </div>
                      </div>
                      {selectedPlan === plan.key && (
                        <div className="absolute top-4 right-4">
                          <CheckCircle size={20} style={{ color: '#2EAF6F' }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button
                    onClick={() => void handlePlanContinue()}
                    disabled={!selectedPlan || planSaving}
                    className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    {planSaving ? 'Saving plan…' : 'Save plan and continue'} <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Finish payment setup 💸
                </h2>
                <p className="text-gray-500 text-sm mb-6">Add a payment method for contributions — it&apos;s saved but not charged yet — and a payout destination for the turn when your group pays out.</p>

                <div className="grid gap-4 mb-8">
                  <Link
                    to="/payments/methods"
                    className="rounded-2xl p-5 bg-white transition-all hover:opacity-90"
                    style={{ border: '1px solid #E5E7EB' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">Add payment method</p>
                        <p className="text-xs text-gray-500 mt-0.5">Save a card so recurring group contributions can be charged securely. Your card is not charged now.</p>
                      </div>
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{
                          color: paymentMethodVerified ? '#2EAF6F' : '#F59E0B',
                          background: paymentMethodVerified ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                        }}
                      >
                        {paymentMethodVerified ? 'Ready' : 'Needed'}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#2EAF6F' }}>
                      Open payment methods <ArrowRight size={16} />
                    </div>
                  </Link>

                  <Link
                    to="/payments/payout"
                    className="rounded-2xl p-5 bg-white transition-all hover:opacity-90"
                    style={{ border: '1px solid #E5E7EB' }}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">Connect payout destination</p>
                        <p className="text-xs text-gray-500 mt-0.5">Set where your rotation payout should be sent once your destination is verified.</p>
                      </div>
                      <span
                        className="text-xs font-bold px-3 py-1 rounded-full"
                        style={{
                          color: payoutVerified ? '#2EAF6F' : '#F59E0B',
                          background: payoutVerified ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                        }}
                      >
                        {payoutVerified ? 'Ready' : 'Needed'}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-2 text-sm font-semibold" style={{ color: '#2EAF6F' }}>
                      Open payout setup <ArrowRight size={16} />
                    </div>
                  </Link>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void refreshPaymentStatus()}
                    disabled={paymentRefreshLoading}
                    className="flex-1 rounded-2xl py-4 font-semibold border-gray-200 text-gray-600"
                  >
                    {paymentRefreshLoading ? 'Refreshing…' : 'Refresh status'}
                  </Button>
                  {paymentSetupComplete && (
                    <Button
                      onClick={nextStep}
                      className="flex-1 rounded-2xl py-4 font-bold gap-2"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                    >
                      Continue <ArrowRight size={18} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Add a profile photo 📸
                </h2>
                <p className="text-gray-500 text-sm mb-8">Help your community recognise you. You can always change this later.</p>

                <div className="flex flex-col items-center mb-8">
                  <div className="relative mb-4">
                    <div
                      className="w-28 h-28 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ background: photoPreview ? 'transparent' : 'linear-gradient(135deg, #2EAF6F, #F59E0B)' }}
                    >
                      {photoPreview
                        ? <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                        : <span className="text-5xl text-white">👤</span>}
                    </div>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="absolute bottom-0 right-0 w-9 h-9 rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                      style={{ background: '#2EAF6F' }}
                      type="button"
                    >
                      <Camera size={15} className="text-white" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
                  </div>
                  <button onClick={() => fileRef.current?.click()} className="text-sm font-bold hover:underline" style={{ color: '#2EAF6F' }} type="button">
                    Upload photo
                  </button>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  {!photoPreview && (
                    <Button variant="outline" onClick={nextStep} className="flex-1 rounded-2xl py-4 font-semibold border-gray-200 text-gray-600">
                      Skip for now
                    </Button>
                  )}
                  {photoPreview && (
                    <Button
                      onClick={() => void handlePhotoContinue()}
                      disabled={photoSaving}
                      className="flex-1 rounded-2xl py-4 font-bold gap-2"
                      style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                    >
                      {photoSaving ? 'Saving…' : 'Continue'} <ArrowRight size={18} />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Tell us about yourself ✨
                </h2>
                <p className="text-gray-500 text-sm mb-6">This appears on your community profile so members know who they&apos;re saving with.</p>

                <div className="flex flex-col gap-4 mb-8">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Display name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={profile.displayName}
                      onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder="How should the community know you?"
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all"
                      style={{ '--tw-ring-color': '#2EAF6F' } as CSSProperties}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Location <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={profile.location}
                      onChange={(event) => setProfile((current) => ({ ...current, location: event.target.value }))}
                      placeholder="e.g. London, UK or Lagos, Nigeria"
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all"
                      style={{ '--tw-ring-color': '#2EAF6F' } as CSSProperties}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Short bio <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={profile.bio}
                      onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))}
                      placeholder="Tell your community a little about yourself..."
                      rows={3}
                      maxLength={160}
                      className="w-full px-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all resize-none"
                      style={{ '--tw-ring-color': '#2EAF6F' } as CSSProperties}
                    />
                    <p className="text-xs text-gray-400 text-right mt-1">{profile.bio.length}/160</p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button
                    onClick={() => void handleProfileContinue()}
                    disabled={!profile.displayName.trim() || profileSaving}
                    className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    {profileSaving ? 'Saving…' : 'Continue'} <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {step === 6 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  What are you saving for? 🎯
                </h2>
                <p className="text-gray-500 text-sm mb-6">Select all that apply — we&apos;ll match you with the right communities.</p>

                <div className="flex flex-wrap gap-2 mb-5">
                  {interestOptions.map(({ label, icon }) => {
                    const active = selectedInterests.includes(label);
                    return (
                      <button
                        key={label}
                        onClick={() => toggleInterest(label)}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-all border-2"
                        style={{
                          borderColor: active ? '#2EAF6F' : '#E5E7EB',
                          background: active ? 'rgba(46,175,111,0.08)' : '#fff',
                          color: active ? '#2EAF6F' : '#374151',
                        }}
                        type="button"
                      >
                        <span>{icon}</span> {label}
                        {active && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-400 mb-4">Community types you&apos;re interested in:</p>
                <div className="flex flex-wrap gap-2 mb-8">
                  {communityTypes.map((communityType) => {
                    const active = selectedTypes.includes(communityType);
                    return (
                      <button
                        key={communityType}
                        onClick={() => toggleType(communityType)}
                        className="px-3.5 py-2 rounded-full text-sm font-semibold transition-all border-2"
                        style={{
                          borderColor: active ? '#F59E0B' : '#E5E7EB',
                          background: active ? 'rgba(245,158,11,0.08)' : '#fff',
                          color: active ? '#F59E0B' : '#374151',
                        }}
                        type="button"
                      >
                        {communityType}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-400 mb-6">{selectedInterests.length} saving goals · {selectedTypes.length} community types selected</p>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button
                    onClick={nextStep}
                    disabled={selectedInterests.length === 0}
                    className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    Continue <ArrowRight size={18} />
                  </Button>
                </div>
              </div>
            )}

            {step === 7 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Stay in the loop 🔔
                </h2>
                <p className="text-gray-500 text-sm mb-8">Choose how you&apos;d like PadiHub to reach you with important updates.</p>

                <div className="flex flex-col gap-4 mb-8">
                  {[
                    { key: 'email' as const, icon: Mail, label: 'Email notifications', desc: 'Contribution reminders, governance updates and community news', color: '#2EAF6F' },
                    { key: 'push' as const, icon: Bell, label: 'Push notifications', desc: 'Real-time alerts when there is activity in your groups', color: '#8B5CF6' },
                    { key: 'sms' as const, icon: Smartphone, label: 'SMS notifications', desc: 'Critical alerts sent by text message', color: '#F59E0B' },
                  ].map((item) => (
                    <div key={item.key} className="flex items-center gap-4 p-4 rounded-2xl border border-gray-100 bg-white">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}12` }}>
                        <item.icon size={18} style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
                      </div>
                      <button
                        role="switch"
                        aria-checked={notifs[item.key]}
                        onClick={() => setNotifs((current) => ({ ...current, [item.key]: !current[item.key] }))}
                        className="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
                        style={{ background: notifs[item.key] ? '#2EAF6F' : '#D1D5DB' }}
                        type="button"
                      >
                        <span
                          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                          style={{ transform: notifs[item.key] ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                    <ArrowLeft size={16} />
                  </Button>
                  <Button
                    onClick={() => void handleNotificationContinue()}
                    disabled={notificationSaving}
                    className="flex-1 rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                  >
                    {notificationSaving ? 'Saving…' : 'Save and continue'} <ArrowRight size={18} />
                  </Button>
                </div>
                <p className="text-center text-xs text-gray-400 mt-3">You can change these anytime in Settings</p>
              </div>
            )}

            {step === 8 && (
              <div>
                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Verify your identity 🛡️
                </h2>
                <p className="text-gray-500 text-sm mb-6">
                  {currentCountry === 'NG'
                    ? 'Nigerian members validate their bank account via Flutterwave Account Resolve (a free, preliminary bank-account check, not full KYC). Your subscription is not charged until this succeeds.'
                    : 'UK members complete Stripe Identity verification right here on PadiHub. Your card was saved but not charged — it is only charged once verification succeeds.'}
                </p>

                <div className="rounded-3xl p-5 bg-white mb-6" style={{ border: '1px solid #E5E7EB' }}>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Verification status</p>
                      <p className="font-bold text-gray-900">{identityVerified ? 'Verified' : 'Still needed'}</p>
                    </div>
                    <span
                      className="text-xs font-bold px-3 py-1 rounded-full"
                      style={{
                        color: identityVerified ? '#2EAF6F' : '#F59E0B',
                        background: identityVerified ? 'rgba(46,175,111,0.12)' : 'rgba(245,158,11,0.12)',
                      }}
                    >
                      {identityVerified ? 'Complete' : currentCountry === 'NG' ? 'Account Resolve required' : 'Stripe Identity required'}
                    </span>
                  </div>
                  <div className="space-y-3 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <p>{currentCountry === 'NG' ? 'Use the secure Account Resolve flow to confirm your bank account.' : 'Use the secure Stripe Identity flow to verify your documents.'}</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle size={16} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <p>Your subscription only starts, and your card/account is only charged, once verification succeeds.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => navigate('/verify-identity')}
                    className="w-full rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2eafaf, #1f8f8f)', color: '#fff' }}
                  >
                    Go to verification <ArrowRight size={18} />
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={prevStep} className="rounded-2xl px-5 gap-2 border-gray-200">
                      <ArrowLeft size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void refreshIdentityStatus()}
                      disabled={identityLoading}
                      className="flex-1 rounded-2xl py-4 font-semibold border-gray-200 text-gray-600"
                    >
                      {identityLoading ? 'Checking…' : 'Check status'}
                    </Button>
                    {identityVerified && (
                      <Button
                        onClick={nextStep}
                        className="flex-1 rounded-2xl py-4 font-bold gap-2"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
                      >
                        Continue <ArrowRight size={18} />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {step === 9 && (
              <div className="text-center">
                <MotionDiv
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', boxShadow: '0 8px 40px rgba(46,175,111,0.4)' }}
                >
                  <span className="text-5xl">🎉</span>
                </MotionDiv>

                <h2 className="text-3xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Welcome to PadiHub™!
                </h2>
                <p className="text-gray-500 mb-8 leading-relaxed">
                  Your community journey starts today. Here&apos;s what&apos;s ready for you:
                </p>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { icon: Shield, label: 'Trust Score™', value: '0 / 100', color: '#2EAF6F', desc: 'Start building' },
                    {
                      icon: Star,
                      label: 'Plan',
                      value: selectedPlan === 'premium' ? 'Premium' : 'Basic',
                      color: '#8B5CF6',
                      desc: selectedPlan === 'premium' ? 'Create up to 3 groups' : 'Join up to 3 groups',
                    },
                    {
                      icon: CreditCard,
                      label: 'Payments',
                      value: paymentSetupComplete ? 'Ready' : 'Pending',
                      color: '#2eafaf',
                      desc: paymentSetupComplete ? 'Contribute and receive payouts' : 'Finish setup',
                    },
                  ].map((card) => (
                    <div key={card.label} className="rounded-2xl p-4 text-left" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-2" style={{ background: `${card.color}15` }}>
                        <card.icon size={15} style={{ color: card.color }} />
                      </div>
                      <p className="text-xs text-gray-500">{card.label}</p>
                      <p className="font-extrabold text-gray-900 text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>{card.value}</p>
                      <p className="text-xs mt-0.5 font-semibold" style={{ color: card.color }}>{card.desc}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-3">
                  <Button
                    asChild
                    className="w-full rounded-2xl py-4 font-bold gap-2"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}
                  >
                    <Link to="/dashboard">Go to my dashboard <ArrowRight size={18} /></Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full rounded-2xl py-4 font-semibold border-gray-200">
                    <Link to="/savings-groups">Explore savings groups</Link>
                  </Button>
                </div>
              </div>
            )}
          </MotionDiv>
        </AnimatePresence>
      </OnboardingShell>
    </>
  );
}
