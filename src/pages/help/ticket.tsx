import { Helmet } from '@dr.pogodin/react-helmet';
import { useState, useEffect } from 'react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  MessageSquare, ArrowLeft, CheckCircle,
  Clock, Shield, Users, PiggyBank, Vote, Award, Globe, Zap
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const categories = [
  { label: 'Trust Score™',   icon: Shield,    color: '#8B5CF6' },
  { label: 'Karma™',         icon: Award,     color: '#F59E0B' },
  { label: 'Savings Groups', icon: PiggyBank, color: '#2EAF6F' },
  { label: 'Communities',    icon: Users,     color: '#2eafaf' },
  { label: 'Passport™',      icon: Globe,     color: '#EF4444' },
  { label: 'Governance',     icon: Vote,      color: '#8B5CF6' },
  { label: 'Subscription',   icon: Zap,       color: '#F59E0B' },
  { label: 'Other',          icon: MessageSquare, color: '#6B7280' },
];

const priorities = [
  { label: 'Low',    desc: 'General question or feedback',     color: '#2EAF6F' },
  { label: 'Medium', desc: 'Issue affecting my experience',    color: '#F59E0B' },
  { label: 'High',   desc: 'Blocking me from using PadiHub',  color: '#EF4444' },
];

export default function SubmitTicketPage() {
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  // Ticket ID uses Math.random() — must be deferred to useEffect to avoid
  // SSR/client hydration mismatch (server and client would generate different values).
  const [ticketId, setTicketId] = useState('TKT-00000');
  useEffect(() => {
    setTicketId(`TKT-${Math.floor(10000 + Math.random() * 90000)}`);
  }, []);

  const canSubmit = category && subject.trim().length > 5 && message.trim().length > 20;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <DashboardLayout>
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
          <MotionDiv initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 40px rgba(46,175,111,0.3)' }}>
            <CheckCircle size={36} color="#fff" />
          </MotionDiv>
          <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Ticket Submitted!
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Your support ticket has been received. Our team will respond within 2 hours.
            </p>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-6 text-left space-y-3">
              {[
                { label: 'Ticket ID',  value: ticketId },
                { label: 'Category',  value: category },
                { label: 'Priority',  value: priority },
                { label: 'Subject',   value: subject },
                { label: 'Status',    value: 'Open · Awaiting response' },
              ].map((row, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-xs text-gray-400">{row.label}</span>
                  <span className="text-xs font-bold text-gray-900">{row.value}</span>
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
              <Link to="/help"
                className="py-3 rounded-2xl text-sm font-bold text-center border transition-all hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#374151' }}>
                Back to Help Centre
              </Link>
              <Link to="/dashboard"
                className="py-3 rounded-2xl text-sm font-bold text-center text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                Return to Dashboard
              </Link>
            </div>
          </MotionDiv>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <Helmet>
        <title>Submit a Support Ticket — PadiHub</title>
        <meta name="description" content="Submit a support ticket to the PadiHub team. We respond within 2 hours." />
        <link rel="canonical" href="https://www.padihub.com/help/ticket" />
      </Helmet>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible">
          <Link to="/help" className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 mb-2 transition-colors">
            <ArrowLeft size={12} /> Help Centre
          </Link>
          <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Submit a Ticket</h1>
          <p className="text-sm text-gray-500 mt-0.5">Our team typically responds within 2 hours during business hours.</p>
        </MotionDiv>

        {/* Response time banner */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="flex items-center gap-3 p-4 rounded-2xl"
          style={{ background: '#F0FDF4', border: '1px solid #D1FAE5' }}>
          <Clock size={16} style={{ color: '#2EAF6F', flexShrink: 0 }} />
          <div>
            <p className="text-sm font-bold" style={{ color: '#065F46' }}>Fast response guaranteed</p>
            <p className="text-xs" style={{ color: '#059669' }}>Mon–Fri 8am–8pm GMT · Sat 9am–5pm GMT · Avg response: 1.4 hours</p>
          </div>
        </MotionDiv>

        {/* Form */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-5">

          {/* Category */}
          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-sm font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>
              What is your ticket about? <span style={{ color: '#EF4444' }}>*</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {categories.map((cat, i) => {
                const isSelected = category === cat.label;
                return (
                  <button key={i} onClick={() => setCategory(cat.label)}
                    className="rounded-2xl p-3 text-center transition-all"
                    style={{
                      background: isSelected ? `${cat.color}12` : '#F9FAFB',
                      border: isSelected ? `1.5px solid ${cat.color}` : '1.5px solid transparent',
                    }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center mx-auto mb-1.5"
                      style={{ background: isSelected ? `${cat.color}20` : '#F3F4F6' }}>
                      <cat.icon size={14} style={{ color: isSelected ? cat.color : '#9CA3AF' }} />
                    </div>
                    <p className="text-xs font-bold" style={{ color: isSelected ? cat.color : '#6B7280' }}>{cat.label}</p>
                  </button>
                );
              })}
            </div>
          </MotionDiv>

          {/* Priority */}
          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h2 className="text-sm font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Priority</h2>
            <div className="grid grid-cols-3 gap-3">
              {priorities.map((p, i) => {
                const isSelected = priority === p.label;
                return (
                  <button key={i} onClick={() => setPriority(p.label)}
                    className="rounded-2xl p-3 text-left transition-all"
                    style={{
                      background: isSelected ? `${p.color}10` : '#F9FAFB',
                      border: isSelected ? `1.5px solid ${p.color}` : '1.5px solid transparent',
                    }}>
                    <div className="w-2 h-2 rounded-full mb-2" style={{ background: p.color }} />
                    <p className="text-sm font-extrabold" style={{ color: isSelected ? p.color : '#374151', fontFamily: 'Nunito, sans-serif' }}>{p.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#9CA3AF' }}>{p.desc}</p>
                  </button>
                );
              })}
            </div>
          </MotionDiv>

          {/* Subject & Message */}
          <MotionDiv variants={fadeUp} className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
            <div>
              <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                Subject <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ borderColor: '#E5E7EB' }} />
            </div>
            <div>
              <label className="block text-sm font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                Message <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea value={message} onChange={e => setMessage(e.target.value)}
                placeholder="Please describe your issue in detail. Include any relevant community names, dates or error messages."
                rows={5}
                className="w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all resize-none"
                style={{ borderColor: '#E5E7EB' }} />
              <p className="text-xs text-gray-400 mt-1">{message.length} characters · minimum 20</p>
            </div>
          </MotionDiv>

          {/* Submit */}
          <MotionDiv variants={fadeUp}>
            <button onClick={handleSubmit} disabled={!canSubmit}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90 disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              <MessageSquare size={16} /> Submit Ticket
            </button>
            <p className="text-xs text-center text-gray-400 mt-3">
              By submitting you agree to our{' '}
              <Link to="/terms" className="underline hover:text-gray-600">Terms of Service</Link> and{' '}
              <Link to="/privacy" className="underline hover:text-gray-600">Privacy Policy</Link>.
            </p>
          </MotionDiv>

        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
