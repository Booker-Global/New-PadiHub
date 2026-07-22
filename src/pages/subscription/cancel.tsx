import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, AlertCircle, CheckCircle, Shield, Users,
  Award, TrendingUp, ArrowRight, Heart
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const lossItems = [
  { icon: Users,     label: 'Access to 4 communities',           color: '#2EAF6F' },
  { icon: Shield,    label: 'Trust Score™ of 847',               color: '#2eafaf' },
  { icon: Award,     label: '1,240 Community Karma™ points',     color: '#F59E0B' },
  { icon: TrendingUp,label: '3 active savings groups',           color: '#8B5CF6' },
];

const reasons = [
  'Too expensive',
  'Not using it enough',
  'Missing features I need',
  'Found a better alternative',
  'Technical issues',
  'Temporary — I\'ll be back',
  'Other',
];

type Step = 'confirm' | 'reason' | 'cancelled';

export default function CancelMembershipPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('confirm');
  const [selectedReason, setSelectedReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCancel = () => {
    if (!selectedReason) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep('cancelled');
    }, 1600);
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Cancel Membership — PadiHub</title>
        <meta name="description" content="Cancel your PadiHub membership. We're sorry to see you go." />
        <link rel="canonical" href="https://padihub.com/subscription/cancel" />
              <meta property="og:title" content="Cancel Membership — PadiHub" />
        <meta property="og:description" content="Cancel your PadiHub membership. We're sorry to see you go." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          {step !== 'cancelled' && (
            <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
              <Link to="/subscription/manage" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
                <ChevronLeft size={16} /> Back
              </Link>
              <div>
                <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Cancel Membership</h1>
                <p className="text-gray-500 text-sm">We're sorry to see you go</p>
              </div>
            </MotionDiv>
          )}

          <AnimatePresence mode="wait">

            {/* Step 1 — Confirm */}
            {step === 'confirm' && (
              <MotionDiv key="confirm" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}>

                {/* Warning */}
                <div className="rounded-2xl p-4 mb-6 flex items-start gap-3"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <AlertCircle size={20} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <div>
                    <p className="font-bold text-sm" style={{ color: '#EF4444' }}>Are you sure you want to cancel?</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      You'll keep full access until <strong>July 1, 2026</strong>. After that, you'll lose access to everything below.
                    </p>
                  </div>
                </div>

                {/* What you'll lose */}
                <div className="rounded-3xl p-5 bg-white mb-6" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <p className="font-bold text-gray-900 mb-4 text-sm">You'll lose access to:</p>
                  <div className="flex flex-col gap-3">
                    {lossItems.map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: '#F9FAFB' }}>
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${item.color}12` }}>
                          <item.icon size={16} style={{ color: item.color }} />
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stay offer */}
                <div className="rounded-3xl p-5 mb-6 relative overflow-hidden"
                  style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                  <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-20" style={{ background: '#2EAF6F' }} />
                  <div className="relative flex items-start gap-3">
                    <Heart size={20} style={{ color: '#EF4444', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p className="font-bold text-white text-sm mb-1">Switch to Annual instead — Save 17%</p>
                      <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        Get the full PadiHub experience for just £49.99/year. That's £4.17/month.
                      </p>
                      <Link to="/subscription/renew?plan=uk-annual"
                        className="inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-all hover:opacity-90"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                        Switch to Annual <ArrowRight size={13} />
                      </Link>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={() => setStep('reason')}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-colors hover:bg-red-50"
                    style={{ color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                    Continue with cancellation
                  </button>
                  <Link to="/subscription"
                    className="w-full py-3.5 rounded-2xl font-bold text-sm text-center transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                    Keep my membership
                  </Link>
                </div>
              </MotionDiv>
            )}

            {/* Step 2 — Reason */}
            {step === 'reason' && (
              <MotionDiv key="reason" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}>

                <div className="rounded-3xl p-6 bg-white mb-5" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <p className="font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>Why are you leaving?</p>
                  <p className="text-sm text-gray-500 mb-5">Your feedback helps us improve PadiHub for everyone.</p>

                  <div className="flex flex-col gap-2 mb-5">
                    {reasons.map(r => (
                      <button key={r} onClick={() => setSelectedReason(r)}
                        className="flex items-center gap-3 p-3.5 rounded-2xl text-left transition-all"
                        style={{
                          background: selectedReason === r ? 'rgba(46,175,111,0.06)' : '#F9FAFB',
                          border: selectedReason === r ? '2px solid #2EAF6F' : '2px solid transparent',
                        }}>
                        <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                          style={{ borderColor: selectedReason === r ? '#2EAF6F' : '#D1D5DB' }}>
                          {selectedReason === r && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#2EAF6F' }} />}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{r}</span>
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors resize-none"
                    rows={3}
                    placeholder="Any additional feedback? (optional)"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <button onClick={handleCancel} disabled={!selectedReason || loading}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all"
                    style={{
                      background: selectedReason ? 'rgba(239,68,68,0.08)' : '#F3F4F6',
                      color: selectedReason ? '#EF4444' : '#9CA3AF',
                      border: selectedReason ? '1px solid rgba(239,68,68,0.25)' : '1px solid #E5E7EB',
                      cursor: selectedReason ? 'pointer' : 'not-allowed',
                    }}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="rgba(239,68,68,0.3)" strokeWidth="3" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Cancelling…
                      </span>
                    ) : 'Confirm cancellation'}
                  </button>
                  <button onClick={() => setStep('confirm')}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm text-gray-500 hover:bg-gray-50 transition-colors"
                    style={{ border: '1px solid #E5E7EB' }}>
                    Go back
                  </button>
                </div>
              </MotionDiv>
            )}

            {/* Step 3 — Cancelled */}
            {step === 'cancelled' && (
              <MotionDiv key="cancelled" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }} className="text-center py-8">

                <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '2px solid rgba(239,68,68,0.2)' }}>
                  <CheckCircle size={36} style={{ color: '#EF4444' }} />
                </div>

                <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Membership cancelled
                </h2>
                <p className="text-gray-500 mb-2">
                  Your membership has been cancelled. You'll keep full access until <strong>July 1, 2026</strong>.
                </p>
                <p className="text-sm text-gray-400 mb-8">A confirmation email has been sent to your inbox.</p>

                <div className="rounded-2xl p-4 mb-8 flex items-center gap-3 text-left"
                  style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                  <Shield size={18} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                  <p className="text-sm text-gray-600">
                    Changed your mind? You can <Link to="/subscription/renew" className="font-bold underline" style={{ color: '#2EAF6F' }}>reactivate your membership</Link> anytime before July 1, 2026.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button onClick={() => navigate('/subscription/renew')}
                    className="px-6 py-3 rounded-2xl font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    Reactivate membership
                  </button>
                  <Link to="/dashboard"
                    className="px-6 py-3 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors text-center"
                    style={{ border: '1px solid #E5E7EB' }}>
                    Back to dashboard
                  </Link>
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
