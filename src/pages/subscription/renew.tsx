import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, ChevronLeft, ArrowRight, Shield, Zap, Star } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const plans = [
  {
    key: 'uk-monthly',
    name: 'UK Monthly',
    price: '£4.99',
    period: '/month',
    billing: 'Billed every month',
    saving: null,
    recommended: false,
    region: '🇬🇧',
  },
  {
    key: 'uk-annual',
    name: 'UK Annual',
    price: '£49.99',
    period: '/year',
    billing: 'Billed once per year',
    saving: 'Save £9.89 (17%)',
    recommended: true,
    region: '🇬🇧',
  },
  {
    key: 'ng-monthly',
    name: 'Nigeria Monthly',
    price: '₦3,500',
    period: '/month',
    billing: 'Billed every month',
    saving: null,
    recommended: false,
    region: '🇳🇬',
  },
  {
    key: 'ng-annual',
    name: 'Nigeria Annual',
    price: '₦35,000',
    period: '/year',
    billing: 'Billed once per year',
    saving: 'Save ₦7,000 (17%)',
    recommended: false,
    region: '🇳🇬',
  },
];

const features = [
  'Unlimited Communities & Savings Groups',
  'Trust Score™',
  'PadiHub Passport™ & Community DNA™',
  'Analytics, Governance & Voting',
  'Priority Support & AI Onboarding',
];

export default function RenewMembershipPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const defaultPlan = searchParams.get('plan') ?? 'uk-annual';
  const [selected, setSelected] = useState(defaultPlan);
  const [loading, setLoading] = useState(false);

  const selectedPlan = plans.find(p => p.key === selected) ?? plans[1];

  const handleRenew = () => {
    setLoading(true);
    setTimeout(() => navigate('/subscription/success?plan=' + selected), 1800);
  };

  return (
    <DashboardLayout>
      <Helmet>
        <title>Renew Membership — PadiHub</title>
        <meta name="description" content="Renew or switch your PadiHub membership plan." />
        <link rel="canonical" href="https://padihub.com/subscription/renew" />
              <meta property="og:title" content="Renew Membership — PadiHub" />
        <meta property="og:description" content="Renew or switch your PadiHub membership plan." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          <MotionDiv variants={fadeUp} className="flex items-center gap-3 mb-6">
            <Link to="/subscription" className="flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back
            </Link>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Renew Membership</h1>
              <p className="text-gray-500 text-sm">Choose or switch your plan</p>
            </div>
          </MotionDiv>

          {/* Current status */}
          <MotionDiv variants={fadeUp} className="rounded-2xl p-4 mb-6 flex items-center gap-3"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <Zap size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
            <div>
              <p className="text-sm font-bold" style={{ color: '#F59E0B' }}>Current plan: UK Monthly — renews Jul 1, 2026</p>
              <p className="text-xs text-gray-500">Switch to annual and save 17% on your next billing cycle.</p>
            </div>
          </MotionDiv>

          {/* Plan selector */}
          <MotionDiv variants={fadeUp} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {plans.map(plan => (
              <button key={plan.key} onClick={() => setSelected(plan.key)}
                className="relative rounded-3xl p-5 text-left transition-all hover:-translate-y-0.5"
                style={{
                  background: selected === plan.key ? 'linear-gradient(135deg, #0F172A, #1A1A2E)' : '#fff',
                  border: selected === plan.key ? '2px solid #2EAF6F' : '2px solid #E5E7EB',
                  boxShadow: selected === plan.key ? '0 4px 20px rgba(46,175,111,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
                }}>
                {plan.recommended && (
                  <span className="absolute -top-3 left-4 text-xs font-bold px-3 py-1 rounded-full text-white"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    ⭐ Best value
                  </span>
                )}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold" style={{ color: selected === plan.key ? 'rgba(255,255,255,0.6)' : '#6B7280' }}>
                    {plan.region} {plan.name}
                  </span>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center"
                    style={{ borderColor: selected === plan.key ? '#2EAF6F' : '#D1D5DB' }}>
                    {selected === plan.key && <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#2EAF6F' }} />}
                  </div>
                </div>
                <div className="flex items-end gap-1 mb-1">
                  <span className="text-3xl font-extrabold" style={{ color: selected === plan.key ? '#fff' : '#111827', fontFamily: 'Nunito, sans-serif' }}>
                    {plan.price}
                  </span>
                  <span className="text-xs mb-1" style={{ color: selected === plan.key ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>{plan.period}</span>
                </div>
                {plan.saving && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(46,175,111,0.15)', color: '#2EAF6F' }}>
                    {plan.saving}
                  </span>
                )}
                <p className="text-xs mt-2" style={{ color: selected === plan.key ? 'rgba(255,255,255,0.35)' : '#9CA3AF' }}>{plan.billing}</p>
              </button>
            ))}
          </MotionDiv>

          {/* What's included */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white mb-6" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
            <p className="text-sm font-bold text-gray-700 mb-3">Everything included with {selectedPlan.name}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {features.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle size={13} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                  <span className="text-xs text-gray-600">{f}</span>
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Confirm */}
          <MotionDiv variants={fadeUp} className="flex flex-col gap-3">
            <button onClick={handleRenew} disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.35)' }}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Processing…
                </span>
              ) : (
                <>Confirm {selectedPlan.name} — {selectedPlan.price}{selectedPlan.period} <ArrowRight size={18} /></>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              <Shield size={11} /> Secured · Cancel anytime · No hidden fees
            </p>
          </MotionDiv>

          {/* Trust signals */}
          <MotionDiv variants={fadeUp} className="mt-6 grid grid-cols-3 gap-4 text-center">
            {[
              { icon: Shield, label: 'Secure payment',  color: '#2EAF6F' },
              { icon: Star,   label: '4.9★ rated',      color: '#F59E0B' },
              { icon: Zap,    label: 'Cancel anytime',  color: '#8B5CF6' },
            ].map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${t.color}12` }}>
                  <t.icon size={16} style={{ color: t.color }} />
                </div>
                <p className="text-xs font-semibold text-gray-500">{t.label}</p>
              </div>
            ))}
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
