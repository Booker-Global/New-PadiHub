import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Users,
  PiggyBank,
  Calendar,
  RotateCcw,
  Shield,
  Mail,
  Eye,
  Sparkles,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { getValidSession } from '@/lib/session';
import { getTrustTiers, getCurrentTier } from '@/lib/trust-tiers';

const fadeSlide = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.2 } },
};

const TOTAL_STEPS = 7;

/**
 * A rotating savings group can never launch with fewer than three active
 * members, so the wizard must not let a leader pick a smaller size — mirrors
 * GROUP_MIN_ACTIVE_MEMBERS_TO_LAUNCH and the API's `maximum_members` minimum.
 */
const MIN_GROUP_MEMBERS = 3;
const MAX_GROUP_MEMBERS = 50;

interface GroupData {
  name: string;
  description: string;
  amount: string;
  currency: 'GBP' | 'NGN';
  frequency: 'monthly' | 'weekly' | 'daily';
  payoutDay: number | null;
  memberCount: number;
  rotationOrder: 'random' | 'manual' | 'fcfs';
  maxMissed: number;
  gracePeriod: number;
  votingRequired: boolean;
  allowSwaps: boolean;
  minTrustScore: number;
  inviteEmails: string;
}

interface SavingsGroup {
  id: string;
  name: string;
}

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  href: string;
  complete: boolean;
}

interface OnboardingProgress {
  steps: OnboardingStep[];
  complete: boolean;
}

interface InvitationResult {
  sent?: string[];
  failed?: { email: string; reason: string }[];
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, string[] | undefined>;
}

const defaultData: GroupData = {
  name: '',
  description: '',
  amount: '',
  currency: 'GBP',
  frequency: 'monthly',
  payoutDay: 1,
  memberCount: 6,
  rotationOrder: 'random',
  maxMissed: 2,
  gracePeriod: 48,
  votingRequired: false,
  allowSwaps: true,
  minTrustScore: 0,
  inviteEmails: '',
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function describeCreatePayoutSchedule(frequency: GroupData['frequency'], payoutDay: number | null): string {
  if (frequency === 'daily') return 'Every day';
  if (frequency === 'weekly') return `Every ${WEEKDAY_NAMES[payoutDay ?? 1] ?? WEEKDAY_NAMES[1]}`;
  const day = payoutDay ?? 1;
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `Monthly on the ${day}${suffix}`;
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

/** Splits the leader's comma/newline/space-separated invite list into addresses. */
function parseInviteEmails(value: string): string[] {
  const candidates = value
    .split(/[\s,;]+/)
    .map(entry => entry.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(candidates)];
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeContributionAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numericAmount = Number(trimmed);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) return null;

  return numericAmount
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="flex-1 h-1.5 rounded-full transition-all duration-300"
          style={{
            background: i <= current ? '#2EAF6F' : '#E5E7EB',
            opacity: i === current ? 1 : i < current ? 1 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

function OptionCard({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 hover:-translate-y-0.5"
      style={{
        borderColor: selected ? '#2EAF6F' : '#E5E7EB',
        background: selected ? 'rgba(46,175,111,0.05)' : '#fff',
      }}
    >
      {children}
      {selected && <CheckCircle size={16} className="float-right mt-0.5" style={{ color: '#2EAF6F' }} />}
    </button>
  );
}

async function fetchMissingOnboardingSteps(token: string): Promise<OnboardingStep[]> {
  try {
    const response = await window.fetch('/api/users/onboarding-status', {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!response.ok) return [];
    const json = await response.json() as ApiResponse<OnboardingProgress>;
    return (json.data?.steps ?? []).filter(step => !step.complete);
  } catch {
    return [];
  }
}

function requiresIdentityVerification(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes('/verify-identity') || normalized.includes('identity verification');
}

export default function CreateGroupWizard() {
  const location = useLocation();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<GroupData>(defaultData);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [needsPaymentSetup, setNeedsPaymentSetup] = useState(false);
  const [needsIdentitySetup, setNeedsIdentitySetup] = useState(false);
  const [bypassing, setBypassing] = useState(false);
  const [createdGroup, setCreatedGroup] = useState<SavingsGroup | null>(null);
  const [inviteSummary, setInviteSummary] = useState<{ sent: string[]; failed: { email: string; reason: string }[] } | null>(null);
  const [missingSteps, setMissingSteps] = useState<OnboardingStep[]>([]);
  const verificationReturnPath = `${location.pathname}${location.search}`;

  const normalizedAmount = useMemo(() => normalizeContributionAmount(data.amount), [data.amount]);
  const amountError = data.amount.trim() && !normalizedAmount
    ? 'Enter a valid amount with up to 2 decimal places.'
    : '';

  const minTrustTierLabel = useMemo(() => {
    if (data.minTrustScore <= 0) return 'Open to anyone (no minimum)';
    const tiers = getTrustTiers(100);
    const tier = getCurrentTier(data.minTrustScore, tiers);
    return `${tier.name} tier or above`;
  }, [data.minTrustScore]);

  const set = <K extends keyof GroupData>(key: K, value: GroupData[K]) => {
    setSubmitError('');
    setNeedsVerification(false);
    setNeedsPaymentSetup(false);
    setNeedsIdentitySetup(false);
    setMissingSteps([]);
    setData(current => ({ ...current, [key]: value }));
  };

  const canContinue =
    step === 0 ? data.name.trim().length >= 2
      : step === 1 ? Boolean(normalizedAmount)
        : true;

  const next = () => {
    if (step < TOTAL_STEPS - 1 && canContinue) {
      setStep(current => current + 1);
    }
  };

  const back = () => {
    if (step > 0) {
      setSubmitError('');
      setNeedsVerification(false);
      setNeedsPaymentSetup(false);
      setNeedsIdentitySetup(false);
      setStep(current => current - 1);
    }
  };

  /**
   * Sends the invitations the leader typed into the wizard. Invitees receive
   * an email that lets them log in (existing members) or sign up (new ones)
   * and walks them through completing their profile before they can join.
   * A failed invite must never make a successfully created group look failed,
   * so problems are surfaced on the confirmation screen instead.
   */
  const sendInvitations = async (groupId: string, token: string) => {
    const emails = parseInviteEmails(data.inviteEmails);
    const valid = emails.filter(isValidEmail);
    const invalid = emails.filter(email => !isValidEmail(email));

    if (!valid.length) {
      setInviteSummary(invalid.length
        ? { sent: [], failed: invalid.map(email => ({ email, reason: 'Not a valid email address.' })) }
        : null);
      return;
    }

    try {
      const response = await window.fetch(`/api/groups/${groupId}/invitations`, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: valid }),
      });
      const json = await response.json() as ApiResponse<InvitationResult>;
      if (!response.ok) {
        setInviteSummary({
          sent: [],
          failed: [
            ...valid.map(email => ({ email, reason: getErrorMessage(json, 'Could not send this invitation.') })),
            ...invalid.map(email => ({ email, reason: 'Not a valid email address.' })),
          ],
        });
        return;
      }
      setInviteSummary({
        sent: json.data?.sent ?? valid,
        failed: [
          ...(json.data?.failed ?? []),
          ...invalid.map(email => ({ email, reason: 'Not a valid email address.' })),
        ],
      });
    } catch {
      setInviteSummary({
        sent: [],
        failed: valid.map(email => ({ email, reason: 'Network error — you can resend from the group page.' })),
      });
    }
  };

  const finish = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setSubmitError('Please log in to create a group.');
      return;
    }

    if (!normalizedAmount) {
      setSubmitError('Enter a valid contribution amount before creating the group.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setNeedsVerification(false);
    setNeedsPaymentSetup(false);
    setNeedsIdentitySetup(false);

    try {
      const response = await window.fetch('/api/groups', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + session.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: data.name.trim(),
          description: data.description.trim() || undefined,
          country: data.currency === 'NGN' ? 'NG' : 'GB',
          currency: data.currency,
          contribution_amount: normalizedAmount,
          contribution_frequency: data.frequency,
          payout_day: data.frequency === 'daily' ? undefined : (data.payoutDay ?? undefined),
          maximum_members: data.memberCount,
          rotation_method: data.rotationOrder === 'random' ? 'random' : 'manual', // "fcfs" has no backend equivalent yet.
          strike_threshold: data.maxMissed,
          allow_payout_swaps: data.allowSwaps,
          min_trust_score: data.minTrustScore || undefined,
        }),
      });

      const json = await response.json() as ApiResponse<SavingsGroup>;
      if (!response.ok) {
        const message = getErrorMessage(json, 'Could not create your group.');
        setSubmitError(message);
        setNeedsVerification(json.code === 'VERIFICATION_REQUIRED');
        setNeedsPaymentSetup(json.code === 'PAYMENT_SETUP_REQUIRED');
        setNeedsIdentitySetup(json.code === 'PAYMENT_SETUP_REQUIRED' && requiresIdentityVerification(message));
        // Ask the server exactly which onboarding steps are still outstanding
        // so the member only sees links for what they actually still need.
        if (json.code === 'PAYMENT_SETUP_REQUIRED') {
          setMissingSteps(await fetchMissingOnboardingSteps(session.token));
        }
        return;
      }

      const group = json.data ?? null;
      setCreatedGroup(group);
      if (group) await sendInvitations(group.id, session.token);
      setDone(true);
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const bypassVerification = async () => {
    const session = getValidSession();
    if (!session?.token) {
      setSubmitError('Please log in to create a group.');
      return;
    }

    setBypassing(true);
    try {
      const response = await window.fetch('/api/identity/bypass', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json() as ApiResponse<{ identity_verified: boolean }>;
      if (!response.ok) {
        setSubmitError(getErrorMessage(json, 'Could not bypass verification.'));
        return;
      }
      setNeedsVerification(false);
      setSubmitError('');
      await finish();
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
    } finally {
      setBypassing(false);
    }
  };


  const rotationDuration = data.frequency === 'monthly'
    ? `${data.memberCount} months`
    : data.frequency === 'weekly'
      ? `${data.memberCount} weeks`
      : `${data.memberCount} days`;

  const stepTitles = [
    'Group Details',
    'Contribution Rules',
    'Group Size',
    'Rotation Rules',
    'Group Rules',
    'Invite Members',
    'Review',
  ];

  if (done) {
    return (
      <DashboardLayout>
        <div className="min-h-screen flex items-center justify-center p-6">
          <MotionDiv
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-md w-full text-center"
          >
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 40px rgba(46,175,111,0.4)' }}
            >
              <Sparkles size={40} className="text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Group Created!
            </h1>
            <p className="text-gray-500 mb-2 text-lg font-semibold">{createdGroup?.name || data.name}</p>
            <p className="text-gray-400 mb-6">Your savings group has been created successfully. Start inviting members to get going.</p>
            {inviteSummary && (inviteSummary.sent.length > 0 || inviteSummary.failed.length > 0) && (
              <div className="rounded-2xl p-4 mb-6 text-left" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                {inviteSummary.sent.length > 0 && (
                  <p className="text-sm text-gray-700">
                    <strong>{inviteSummary.sent.length}</strong> invitation{inviteSummary.sent.length === 1 ? '' : 's'} sent. Invitees will be asked to log in or sign up, complete their profile, then join your group.
                  </p>
                )}
                {inviteSummary.failed.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-bold" style={{ color: '#B91C1C' }}>Couldn&apos;t invite:</p>
                    <ul className="mt-1 space-y-0.5">
                      {inviteSummary.failed.map(failure => (
                        <li key={failure.email} className="text-xs text-gray-600">{failure.email} — {failure.reason}</li>
                      ))}
                    </ul>
                    <p className="text-xs text-gray-500 mt-1">You can resend these from the group page.</p>
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col gap-3">
              <Button
                asChild
                className="w-full rounded-2xl font-bold py-3"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
              >
                <Link to={createdGroup ? `/savings-groups/${createdGroup.id}` : '/savings-groups'}>Invite Members</Link>
              </Button>
              <Button asChild variant="outline" className="w-full rounded-2xl font-bold py-3">
                <Link to="/dashboard">Return to Dashboard</Link>
              </Button>
            </div>
          </MotionDiv>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Create Savings Group — PadiHub</title>
        <meta name="description" content="Set up your rotating savings group on PadiHub in a few simple steps." />
        <link rel="canonical" href="https://padihub.com/savings-groups/create" />
        <meta property="og:title" content="Create Savings Group — PadiHub" />
        <meta property="og:description" content="Set up your rotating savings group on PadiHub in a few simple steps." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6 pt-10">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold mb-4"
              style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.2)' }}
            >
              <PiggyBank size={12} /> Step {step + 1} of {TOTAL_STEPS}
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {stepTitles[step]}
            </h1>
          </div>

          <StepIndicator current={step} total={TOTAL_STEPS} />

          <div className="rounded-3xl bg-white p-7 mb-5" style={{ border: '1px solid #F3F4F6', boxShadow: '0 4px 24px rgba(0,0,0,0.06)' }}>
            {step === 6 && submitError && (
              <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', marginBottom: 20 }}>
                <p>{submitError}</p>
                {needsVerification && (
                  <div className="flex gap-3 mt-3 flex-wrap items-center">
                    <Link to={`/verify-identity?next=${encodeURIComponent(verificationReturnPath)}`} style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textDecoration: 'underline' }}>Verify your identity</Link>
                    {import.meta.env.DEV && (
                      <button
                        type="button"
                        onClick={() => void bypassVerification()}
                        disabled={bypassing}
                        style={{ borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 700, background: '#DC2626', color: '#fff', opacity: bypassing ? 0.7 : 1 }}
                      >
                        {bypassing ? 'Bypassing verification…' : 'Bypass verification (test mode)'}
                      </button>
                    )}
                  </div>
                )}
                {needsPaymentSetup && (
                  <div className="flex flex-col gap-2 mt-3">
                    {(missingSteps.length ? missingSteps : []).map(step => (
                      <Link
                        key={step.key}
                        to={step.key === 'identity' ? `/verify-identity?next=${encodeURIComponent(verificationReturnPath)}` : step.href}
                        style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textDecoration: 'underline' }}
                      >
                        {step.label}
                      </Link>
                    ))}
                    {!missingSteps.length && (
                      <div className="flex gap-3 flex-wrap">
                        {needsIdentitySetup && (
                          <Link to={`/verify-identity?next=${encodeURIComponent(verificationReturnPath)}`} style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textDecoration: 'underline' }}>Verify your identity</Link>
                        )}
                        <Link to="/payments/methods" style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textDecoration: 'underline' }}>Add payment method</Link>
                        <Link to="/payments/payout" style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', textDecoration: 'underline' }}>Connect payout destination</Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <AnimatePresence mode="wait">
              <MotionDiv key={step} variants={fadeSlide} initial="hidden" animate="visible" exit="exit">
                {step === 0 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-sm mb-5">Give your savings group a name and an optional description.</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Group Name <span className="text-red-400">*</span></label>
                      <input
                        value={data.name}
                        onChange={event => set('name', event.target.value)}
                        placeholder="e.g. Lagos Savers Circle"
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Description <span className="text-gray-400 font-normal">(optional)</span></label>
                      <textarea
                        value={data.description}
                        onChange={event => set('description', event.target.value)}
                        placeholder="What is this group saving for?"
                        rows={3}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors resize-none"
                      />
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-sm mb-5">Set how much each member contributes and how often.</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1.5">Amount <span className="text-red-400">*</span></label>
                        <input
                          value={data.amount}
                          onChange={event => set('amount', event.target.value)}
                          placeholder="e.g. 150"
                          inputMode="decimal"
                          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors"
                        />
                        {amountError && <p className="text-xs text-red-500 mt-1.5">{amountError}</p>}
                      </div>
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1.5">Currency</label>
                        <select
                          value={data.currency}
                          onChange={event => set('currency', event.target.value as GroupData['currency'])}
                          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors bg-white"
                        >
                          <option value="GBP">GBP (£)</option>
                          <option value="NGN">NGN (₦)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Frequency</label>
                      <div className={`grid gap-3 ${import.meta.env.DEV ? 'grid-cols-3' : 'grid-cols-2'}`}>
                        {(import.meta.env.DEV ? (['monthly', 'weekly', 'daily'] as const) : (['monthly', 'weekly'] as const)).map(frequency => (
                          <OptionCard
                            key={frequency}
                            selected={data.frequency === frequency}
                            onClick={() => {
                              set('frequency', frequency);
                              set('payoutDay', frequency === 'daily' ? null : frequency === 'weekly' ? 1 : 1);
                            }}
                          >
                            <p className="font-bold text-gray-900 capitalize">{frequency}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {frequency === 'monthly' ? 'Default — most common' : frequency === 'weekly' ? 'Every week' : 'Every day — dev/test only'}
                            </p>
                          </OptionCard>
                        ))}
                      </div>
                      {!import.meta.env.DEV && (
                        <p className="text-xs text-gray-400 mt-1.5">Daily contributions are only available in development/testing environments.</p>
                      )}
                    </div>

                    {data.frequency === 'weekly' && (
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-2">Payout day <span className="text-red-400">*</span></label>
                        <p className="text-xs text-gray-500 mb-2">Which day of the week should contributions and payouts be collected?</p>
                        <select
                          value={data.payoutDay ?? 1}
                          onChange={event => set('payoutDay', Number(event.target.value))}
                          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors bg-white"
                        >
                          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => (
                            <option key={day} value={index}>{day}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {data.frequency === 'monthly' && (
                      <div>
                        <label className="text-sm font-bold text-gray-700 block mb-2">Payout day <span className="text-red-400">*</span></label>
                        <p className="text-xs text-gray-500 mb-2">Which day of the month should contributions and payouts be collected? (Clamped to the last day for shorter months.)</p>
                        <input
                          type="number"
                          min={1}
                          max={31}
                          value={data.payoutDay ?? 1}
                          onChange={event => set('payoutDay', Math.min(31, Math.max(1, Number(event.target.value) || 1)))}
                          className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors"
                        />
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <p className="text-gray-500 text-sm mb-5">How many members will be in this group?</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Number of Members</label>
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => set('memberCount', Math.max(MIN_GROUP_MEMBERS, data.memberCount - 1))}
                          disabled={data.memberCount <= MIN_GROUP_MEMBERS}
                          className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          −
                        </button>
                        <span className="text-4xl font-black w-16 text-center" style={{ fontFamily: 'Nunito, sans-serif', color: '#2EAF6F' }}>{data.memberCount}</span>
                        <button
                          onClick={() => set('memberCount', Math.min(MAX_GROUP_MEMBERS, data.memberCount + 1))}
                          className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-lg font-bold hover:bg-gray-50 transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        A savings group needs at least {MIN_GROUP_MEMBERS} members to start collecting, and can have up to {MAX_GROUP_MEMBERS}.
                      </p>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar size={15} style={{ color: '#2EAF6F' }} />
                        <p className="text-sm font-bold" style={{ color: '#2EAF6F' }}>Estimated rotation duration</p>
                      </div>
                      <p className="text-2xl font-black text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{rotationDuration}</p>
                      <p className="text-xs text-gray-500 mt-1">{data.memberCount} members × 1 {data.frequency} payout cycle each</p>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <p className="text-gray-500 text-sm mb-5">How should the payout order be determined?</p>
                    {[
                      { value: 'random', label: 'Random Order', desc: 'Payout order is randomly assigned when the group starts' },
                      { value: 'manual', label: 'Manual Order', desc: 'You as leader assign the payout order manually' },
                      { value: 'fcfs', label: 'First Come, First Served', desc: 'Members who join first get earlier payout positions' },
                    ].map(option => (
                      <OptionCard
                        key={option.value}
                        selected={data.rotationOrder === option.value as GroupData['rotationOrder']}
                        onClick={() => set('rotationOrder', option.value as GroupData['rotationOrder'])}
                      >
                        <div className="flex items-start gap-3">
                          <RotateCcw size={16} style={{ color: '#2EAF6F', marginTop: 2 }} />
                          <div>
                            <p className="font-bold text-gray-900 text-sm">{option.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{option.desc}</p>
                          </div>
                        </div>
                      </OptionCard>
                    ))}

                    {data.rotationOrder === 'fcfs' && (
                      <p className="text-xs px-3 py-2 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', color: '#B45309' }}>
                        Note: "First come, first served" isn't tracked separately yet — this group will be created with manual payout ordering, so you'll assign positions as the leader.
                      </p>
                    )}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-5">
                    <p className="text-gray-500 text-sm mb-5">Set the rules for missed payments and group governance.</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Maximum missed payments before removal</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[1, 2, 3].map(value => (
                          <OptionCard key={value} selected={data.maxMissed === value} onClick={() => set('maxMissed', value)}>
                            <p className="font-black text-2xl text-center" style={{ fontFamily: 'Nunito, sans-serif', color: data.maxMissed === value ? '#2EAF6F' : '#9CA3AF' }}>{value}</p>
                          </OptionCard>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Late payment grace period</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[24, 48, 72].map(hours => (
                          <OptionCard key={hours} selected={data.gracePeriod === hours} onClick={() => set('gracePeriod', hours)}>
                            <p className="font-bold text-sm text-center text-gray-900">{hours}h</p>
                          </OptionCard>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <OptionCard selected={data.votingRequired} onClick={() => set('votingRequired', !data.votingRequired)}>
                        <div className="flex items-center gap-3">
                          <Shield size={16} style={{ color: '#8B5CF6' }} />
                          <div>
                            <p className="font-bold text-sm text-gray-900">Require voting for key decisions</p>
                            <p className="text-xs text-gray-400">Members vote on removing members, admitting new ones and payout swaps</p>
                          </div>
                        </div>
                      </OptionCard>
                      <OptionCard selected={data.allowSwaps} onClick={() => set('allowSwaps', !data.allowSwaps)}>
                        <div className="flex items-center gap-3">
                          <RotateCcw size={16} style={{ color: '#F59E0B' }} />
                          <div>
                            <p className="font-bold text-sm text-gray-900">Allow payout swap requests</p>
                            <p className="text-xs text-gray-400">Members can request to swap their payout position with another member</p>
                          </div>
                        </div>
                      </OptionCard>
                    </div>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-2">Minimum Trust Score™ to join</label>
                      <p className="text-xs text-gray-400 mb-3">Only members with at least this Trust Score™ can request to join your group. Set to 0 to allow anyone.</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {[0, 20, 30, 50, 70, 85].map(value => (
                          <OptionCard key={value} selected={data.minTrustScore === value} onClick={() => set('minTrustScore', value)}>
                            <p className="font-black text-lg text-center" style={{ fontFamily: 'Nunito, sans-serif', color: data.minTrustScore === value ? '#2EAF6F' : '#9CA3AF' }}>{value}</p>
                          </OptionCard>
                        ))}
                      </div>
                      <p className="text-xs text-gray-400 mt-2">Currently: {minTrustTierLabel}</p>
                    </div>
                  </div>
                )}

                {step === 5 && (
                  <div className="space-y-5">
                    <p className="text-gray-500 text-sm mb-5">Add the email addresses of the people you want in this group — we&apos;ll email them an invitation as soon as the group is created.</p>
                    <div>
                      <label className="text-sm font-bold text-gray-700 block mb-1.5">Invite by email</label>
                      <textarea
                        value={data.inviteEmails}
                        onChange={event => set('inviteEmails', event.target.value)}
                        placeholder="Enter email addresses, separated by commas or one per line"
                        rows={4}
                        className="w-full px-4 py-3 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:border-green-400 transition-colors resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Each person gets an email inviting them to log in (or sign up), complete their profile and join this group. You can send more invites from the group page later.
                      </p>
                    </div>
                    <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Mail size={15} style={{ color: '#2EAF6F' }} />
                        <p className="text-sm font-bold text-gray-700">Invite link</p>
                      </div>
                      <div className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-400">
                        A shareable link will be generated once your group has been created.
                      </div>
                    </div>
                  </div>
                )}

                {step === 6 && (
                  <div className="space-y-4">
                    <p className="text-gray-500 text-sm mb-5">Review your group settings before creating.</p>
                    {[
                      { icon: PiggyBank, label: 'Group Name', value: data.name || '—' },
                      { icon: PiggyBank, label: 'Contribution', value: `${data.currency === 'GBP' ? '£' : '₦'}${normalizedAmount || data.amount || '—'} / ${data.frequency}` },
                      { icon: Users, label: 'Members', value: `${data.memberCount} members` },
                      { icon: Calendar, label: 'Rotation duration', value: rotationDuration },
                      { icon: Calendar, label: 'Payout schedule', value: describeCreatePayoutSchedule(data.frequency, data.payoutDay) },
                      { icon: RotateCcw, label: 'Payout order', value: data.rotationOrder === 'random' ? 'Random' : data.rotationOrder === 'manual' ? 'Manual' : 'First come, first served' },
                      { icon: Shield, label: 'Max missed payments', value: `${data.maxMissed} missed` },
                      { icon: Eye, label: 'Grace period', value: `${data.gracePeriod} hours` },
                      { icon: Shield, label: 'Minimum Trust Score™ to join', value: data.minTrustScore > 0 ? `${data.minTrustScore}+ (${minTrustTierLabel})` : 'None' },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 gap-4">
                        <div className="flex items-center gap-2">
                          <row.icon size={14} style={{ color: '#2EAF6F' }} />
                          <span className="text-sm text-gray-500">{row.label}</span>
                        </div>
                        <span className="text-sm font-bold text-gray-900 text-right">{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </MotionDiv>
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-3">
            {step > 0 ? (
              <Button variant="outline" onClick={back} disabled={submitting} className="rounded-2xl px-5 gap-2 font-bold">
                <ArrowLeft size={16} /> Back
              </Button>
            ) : (
              <Button variant="outline" asChild className="rounded-2xl px-5 font-bold">
                <Link to="/dashboard">Cancel</Link>
              </Button>
            )}
            <Button
              onClick={step === TOTAL_STEPS - 1 ? () => void finish() : next}
              disabled={!canContinue || submitting}
              className="flex-1 rounded-2xl font-bold gap-2"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}
            >
              {step === TOTAL_STEPS - 1 ? (
                submitting ? (
                  <>
                    <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                    Creating...
                  </>
                ) : (
                  <><CheckCircle size={16} /> Create Group</>
                )
              ) : (
                <>Continue <ArrowRight size={16} /></>
              )}
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
