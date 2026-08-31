import { Helmet } from '@dr.pogodin/react-helmet';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MessageSquare, ArrowLeft, CheckCircle, Clock, Shield, PiggyBank,
  Globe, Zap, Mail, XCircle,
} from 'lucide-react';

import { MotionDiv } from '@/lib/motion-safe';
import { getValidSession, type SessionData } from '@/lib/session';

import HelpRouteLayout from './HelpRouteLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const CONTACT_SUBJECT_OPTIONS = [
  'General enquiry',
  'Technical support',
  'Billing question',
  'Community help',
  'Partnership',
] as const;

const ticketTopics = [
  { value: 'technical', label: 'Technical support', icon: Shield, color: '#8B5CF6' },
  { value: 'groups', label: 'Savings groups', icon: PiggyBank, color: '#2EAF6F' },
  { value: 'payments', label: 'Payments', icon: Globe, color: '#2eafaf' },
  { value: 'subscriptions', label: 'Subscription', icon: Zap, color: '#F59E0B' },
  { value: 'general', label: 'General question', icon: MessageSquare, color: '#6B7280' },
] as const;

const priorities = [
  { value: 'low', label: 'Low', desc: 'General question or feedback', color: '#2EAF6F' },
  { value: 'medium', label: 'Medium', desc: 'Issue affecting my experience', color: '#F59E0B' },
  { value: 'high', label: 'High', desc: 'Blocking me from using PadiHub', color: '#EF4444' },
] as const;

type TicketTopicValue = typeof ticketTopics[number]['value'];
type PriorityValue = typeof priorities[number]['value'];

type SupportIdentity = {
  firstName: string;
  lastName: string;
  email: string;
};

type SupportForm = SupportIdentity & {
  category: TicketTopicValue | '';
  priority: PriorityValue;
  subject: typeof CONTACT_SUBJECT_OPTIONS[number] | '';
  message: string;
};

type SubmittedTicket = {
  ticketRef: string;
  categoryLabel: string;
  priorityLabel: string;
  subject: string;
  replyEmail: string;
};

function splitName(name?: string): Pick<SupportIdentity, 'firstName' | 'lastName'> {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  };
}

function deriveIdentityFromSession(session: SessionData | null): SupportIdentity {
  const nameParts = splitName(session?.name);
  return {
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    email: session?.email ?? '',
  };
}

export default function SubmitTicketPage() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState<SubmittedTicket | null>(null);
  const [form, setForm] = useState<SupportForm>({
    firstName: '',
    lastName: '',
    email: '',
    category: '',
    priority: 'medium',
    subject: '',
    message: '',
  });

  useEffect(() => {
    const activeSession = getValidSession();
    setSession(activeSession);

    if (!activeSession?.token) return;

    const fallbackIdentity = deriveIdentityFromSession(activeSession);
    setForm(current => ({ ...current, ...fallbackIdentity }));
    setLoadingProfile(true);

    void window.fetch('/api/users/profile', {
      headers: { Authorization: 'Bearer ' + activeSession.token },
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed to load profile.');
        return response.json() as Promise<{ data?: { first_name?: string | null; last_name?: string | null; email?: string | null } }>;
      })
      .then(json => {
        const profile = json.data;
        const resolvedIdentity: SupportIdentity = {
          firstName: profile?.first_name?.trim() || fallbackIdentity.firstName,
          lastName: profile?.last_name?.trim() || fallbackIdentity.lastName,
          email: profile?.email?.trim() || fallbackIdentity.email,
        };
        setForm(current => ({ ...current, ...resolvedIdentity }));
      })
      .catch(() => {
        setForm(current => ({ ...current, ...fallbackIdentity }));
      })
      .finally(() => {
        setLoadingProfile(false);
      });
  }, []);

  const isAuthenticated = Boolean(session?.token);
  const selectedCategory = useMemo(
    () => ticketTopics.find(topic => topic.value === form.category) ?? null,
    [form.category],
  );
  const selectedPriority = useMemo(
    () => priorities.find(priority => priority.value === form.priority) ?? priorities[1],
    [form.priority],
  );

  const canSubmit = Boolean(
    !loadingProfile
    && form.category
    && form.subject
    && form.message.trim().length >= 20
    && form.email.trim()
    && (isAuthenticated || (form.firstName.trim() && form.lastName.trim())),
  );

  const setField = <K extends keyof SupportForm>(key: K, value: SupportForm[K]) => {
    setForm(current => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit) {
      setError('Please complete all required fields before submitting your ticket.');
      return;
    }

    setError('');
    setLoading(true);

    const trimmedForm = {
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      message: form.message.trim(),
    };

    const endpoint = isAuthenticated ? '/api/support' : '/api/support/public';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.token) headers.Authorization = 'Bearer ' + session.token;

    const body = isAuthenticated
      ? {
        subject: trimmedForm.subject,
        category: trimmedForm.category,
        description: trimmedForm.message,
        priority: trimmedForm.priority,
      }
      : {
        firstName: trimmedForm.firstName,
        lastName: trimmedForm.lastName,
        email: trimmedForm.email,
        subject: trimmedForm.subject,
        category: trimmedForm.category,
        priority: trimmedForm.priority,
        message: trimmedForm.message,
      };

    try {
      const response = await window.fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError((json as { message?: string }).message ?? 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted({
        ticketRef: (json as { data?: { ticketRef?: string } }).data?.ticketRef ?? 'TKT-PENDING',
        categoryLabel: selectedCategory?.label ?? 'General question',
        priorityLabel: selectedPriority.label,
        subject: trimmedForm.subject,
        replyEmail: trimmedForm.email,
      });
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <HelpRouteLayout>
        <Helmet>
          <title>Ticket Submitted — PadiHub Support</title>
          <meta property="og:title" content="Ticket Submitted — PadiHub Support" />
          <meta property="og:description" content="Submit a support ticket to the PadiHub team. We respond within 2 hours." />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
          <meta name="robots" content="noindex,nofollow" />
        </Helmet>
        <div className="max-w-md mx-auto px-4 py-16 text-center">
          <MotionDiv initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }} className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 40px rgba(46,175,111,0.3)' }}>
            <CheckCircle size={36} color="#fff" />
          </MotionDiv>
          <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Ticket Submitted!
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Your support ticket has been received. Our team will reply to {submitted.replyEmail}.
            </p>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6 text-left space-y-3">
              {[
                { label: 'Ticket ID', value: submitted.ticketRef },
                { label: 'What it is about', value: submitted.categoryLabel },
                { label: 'Priority', value: submitted.priorityLabel },
                { label: 'Subject', value: submitted.subject },
                { label: 'Status', value: 'Open · Awaiting response' },
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-3">
                  <span className="text-xs text-gray-400">{row.label}</span>
                  <span className="text-xs font-bold text-right text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 p-3 rounded-2xl" style={{ background: '#F0FDF4' }}>
                <Clock size={14} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                <p className="text-xs" style={{ color: '#065F46' }}>
                  Expected response: <strong>within 2 hours</strong> during business hours
                </p>
              </div>
              <Link to="/help" className="py-3 rounded-2xl text-sm font-bold text-center border transition-all hover:bg-gray-50" style={{ borderColor: '#E5E7EB', color: '#374151' }}>
                Back to Help
              </Link>
              <Link to={isAuthenticated ? '/dashboard' : '/'} className="py-3 rounded-2xl text-sm font-bold text-center text-white transition-all hover:opacity-90" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                {isAuthenticated ? 'Return to Dashboard' : 'Return Home'}
              </Link>
            </div>
          </MotionDiv>
        </div>
      </HelpRouteLayout>
    );
  }

  return (
    <HelpRouteLayout>
      <Helmet>
        <title>Submit a Support Ticket — PadiHub</title>
        <meta name="description" content="Submit a support ticket to the PadiHub team. We respond within 2 hours." />
        <link rel="canonical" href="https://www.padihub.com/help/ticket" />
      </Helmet>

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible">
          <Link to="/help" className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 mb-2 transition-colors">
            <ArrowLeft size={12} /> Help &amp; Support
          </Link>
          <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Submit a Ticket</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tell us what&apos;s going on and we&apos;ll send it to hello@padihub.com.</p>
        </MotionDiv>

        <MotionDiv variants={fadeUp} initial="hidden" animate="visible" className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: '#F0FDF4', border: '1px solid #D1FAE5' }}>
          <Clock size={16} style={{ color: '#2EAF6F', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: '#065F46' }}>Fast response guaranteed</p>
            <p className="text-xs" style={{ color: '#059669' }}>Mon–Fri 8am–8pm GMT · Sat 9am–5pm GMT · Avg response: 1.4 hours</p>
          </div>
        </MotionDiv>

        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-5">
          {error && (
            <MotionDiv variants={fadeUp} className="rounded-2xl border p-4 flex items-center gap-3" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#DC2626' }}>
              <XCircle size={16} />
              <p className="text-sm font-medium">{error}</p>
            </MotionDiv>
          )}

          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Mail size={16} style={{ color: '#2EAF6F' }} />
              <h2 className="text-sm font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Contact details</h2>
            </div>

            {isAuthenticated ? (
              <div className="rounded-2xl p-4" style={{ background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <p className="text-xs text-gray-500 mb-2">We&apos;ll use the details on your profile for this ticket.</p>
                {loadingProfile ? (
                  <p className="text-sm font-semibold text-gray-700">Loading your profile…</p>
                ) : (
                  <div className="space-y-1 text-sm text-gray-700">
                    <p className="font-bold text-gray-900">{`${form.firstName} ${form.lastName}`.trim() || 'PadiHub member'}</p>
                    <p>{form.email}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    First name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    value={form.firstName}
                    onChange={e => setField('firstName', e.target.value)}
                    placeholder="Your first name"
                    className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E5E7EB' }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    Last name <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    value={form.lastName}
                    onChange={e => setField('lastName', e.target.value)}
                    placeholder="Your last name"
                    className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E5E7EB' }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                    Email <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setField('email', e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all"
                    style={{ borderColor: '#E5E7EB' }}
                  />
                </div>
              </div>
            )}
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-sm font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>
              What is your ticket about? <span style={{ color: '#EF4444' }}>*</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ticketTopics.map(topic => {
                const isSelected = form.category === topic.value;
                return (
                  <button
                    key={topic.value}
                    type="button"
                    onClick={() => setField('category', topic.value)}
                    className="rounded-2xl p-3 text-center transition-all"
                    style={{
                      background: isSelected ? `${topic.color}12` : '#F9FAFB',
                      border: isSelected ? `1.5px solid ${topic.color}` : '1.5px solid transparent',
                    }}
                  >
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-1.5" style={{ background: isSelected ? `${topic.color}20` : '#F3F4F6' }}>
                      <topic.icon size={14} style={{ color: isSelected ? topic.color : '#9CA3AF' }} />
                    </div>
                    <p className="text-xs font-bold" style={{ color: isSelected ? topic.color : '#6B7280' }}>{topic.label}</p>
                  </button>
                );
              })}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-sm font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Priority</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {priorities.map(priority => {
                const isSelected = form.priority === priority.value;
                return (
                  <button
                    key={priority.value}
                    type="button"
                    onClick={() => setField('priority', priority.value)}
                    className="rounded-2xl p-3 text-left transition-all"
                    style={{
                      background: isSelected ? `${priority.color}10` : '#F9FAFB',
                      border: isSelected ? `1.5px solid ${priority.color}` : '1.5px solid transparent',
                    }}
                  >
                    <div className="w-2 h-2 rounded-full mb-2" style={{ background: priority.color }} />
                    <p className="text-sm font-extrabold" style={{ color: isSelected ? priority.color : '#374151', fontFamily: 'Nunito, sans-serif' }}>{priority.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{priority.desc}</p>
                  </button>
                );
              })}
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
            <div>
              <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                Subject <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <select
                value={form.subject}
                onChange={e => setField('subject', e.target.value as SupportForm['subject'])}
                className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all bg-white"
                style={{ borderColor: '#E5E7EB' }}
              >
                <option value="">Select a topic</option>
                {CONTACT_SUBJECT_OPTIONS.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                Message <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                value={form.message}
                onChange={e => setField('message', e.target.value)}
                placeholder="Please describe your issue in detail. Include any relevant community names, dates or error messages."
                rows={6}
                className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all resize-none"
                style={{ borderColor: '#E5E7EB' }}
              />
              <p className="text-xs text-gray-400 mt-1">{form.message.length} characters · minimum 20</p>
            </div>
          </MotionDiv>

          <MotionDiv variants={fadeUp}>
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                  Submitting...
                </span>
              ) : (
                <>
                  <MessageSquare size={16} /> Submit Ticket
                </>
              )}
            </button>
            <p className="text-xs text-center text-gray-400 mt-3">
              By submitting you agree to our <Link to="/terms" className="underline hover:text-gray-600">Terms of Service</Link> and <Link to="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>.
            </p>
          </MotionDiv>
        </MotionDiv>
      </form>
    </HelpRouteLayout>
  );
}
