import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Shield, Lock, ArrowRight, ChevronLeft, CreditCard, Smartphone } from 'lucide-react';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

const planDetails: Record<string, { name: string; price: string; period: string; billing: string; saving: string | null; region: string }> = {
  'uk-monthly': { name: 'UK Monthly',        price: '£4.99',   period: '/month', billing: 'Billed monthly',   saving: null,              region: '🇬🇧 United Kingdom' },
  'uk-annual':  { name: 'UK Annual',         price: '£49.99',  period: '/year',  billing: 'Billed annually',  saving: 'You save £9.89',   region: '🇬🇧 United Kingdom' },
  'ng-monthly': { name: 'Nigeria Monthly',   price: '₦3,500',  period: '/month', billing: 'Billed monthly',   saving: null,              region: '🇳🇬 Nigeria' },
  'ng-annual':  { name: 'Nigeria Annual',    price: '₦35,000', period: '/year',  billing: 'Billed annually',  saving: 'You save ₦7,000',  region: '🇳🇬 Nigeria' },
};

const features = [
  'Unlimited Communities & Savings Groups',
  'Trust Score™',
  'PadiHub Passport™ & Community DNA™',
  'Analytics, Governance & Voting',
  'Priority Support & AI Onboarding',
];

export default function SubscriptionConfirmPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const planKey = searchParams.get('plan') ?? 'uk-annual';
  const plan = planDetails[planKey] ?? planDetails['uk-annual'];

  const [payMethod, setPayMethod] = useState<'card' | 'mobile'>('card');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = () => {
    if (!agreed) return;
    setLoading(true);
    setTimeout(() => navigate('/subscription/success?plan=' + planKey), 1800);
  };

  return (
    <>
      <Helmet>
        <title>Confirm Membership — PadiHub</title>
        <meta name="description" content="Confirm your PadiHub membership plan and start your 30-day free trial." />
        <link rel="canonical" href="https://padihub.com/subscription/confirm" />
              <meta property="og:title" content="Confirm Membership — PadiHub" />
        <meta property="og:description" content="Confirm your PadiHub membership plan and start your 30-day free trial." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="min-h-screen py-12 px-4" style={{ background: '#F9FAFB' }}>
        <div className="max-w-5xl mx-auto">
          {/* Back */}
          <Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 mb-8 transition-colors">
            <ChevronLeft size={16} /> Back to pricing
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            {/* Left — form */}
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="lg:col-span-3 flex flex-col gap-6">
              <MotionDiv variants={fadeUp}>
                <h1 className="text-2xl font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Confirm your membership
                </h1>
                <p className="text-gray-500 text-sm">Start your 30-day free trial. No charge today.</p>
              </MotionDiv>

              {/* Trial callout */}
              <MotionDiv variants={fadeUp} className="rounded-2xl p-4 flex items-center gap-3"
                style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.2)' }}>
                <CheckCircle size={20} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: '#2EAF6F' }}>30-day free trial included</p>
                  <p className="text-xs text-gray-500">You won't be charged until your trial ends. Cancel anytime before then.</p>
                </div>
              </MotionDiv>

              {/* Payment method */}
              <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Payment method</h2>
                <div className="flex gap-3 mb-5">
                  {[
                    { key: 'card',   label: 'Card',          icon: CreditCard },
                    { key: 'mobile', label: 'Mobile Money',  icon: Smartphone },
                  ].map(m => (
                    <button key={m.key} onClick={() => setPayMethod(m.key as 'card' | 'mobile')}
                      className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold transition-all"
                      style={{
                        background: payMethod === m.key ? 'rgba(46,175,111,0.08)' : '#F9FAFB',
                        border: payMethod === m.key ? '2px solid #2EAF6F' : '2px solid #E5E7EB',
                        color: payMethod === m.key ? '#2EAF6F' : '#6B7280',
                      }}>
                      <m.icon size={16} /> {m.label}
                    </button>
                  ))}
                </div>

                {payMethod === 'card' ? (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Card number</label>
                      <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                        placeholder="1234 5678 9012 3456" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Expiry</label>
                        <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                          placeholder="MM / YY" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">CVV</label>
                        <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                          placeholder="•••" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Name on card</label>
                      <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                        placeholder="Full name" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Mobile number</label>
                      <input className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
                        placeholder="+234 800 000 0000" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Provider</label>
                      <select className="w-full px-4 py-3 rounded-2xl text-sm border border-gray-200 focus:outline-none focus:border-green-400 transition-colors bg-white">
                        <option>MTN Mobile Money</option>
                        <option>Airtel Money</option>
                        <option>Opay</option>
                        <option>Other mobile money provider</option>
                      </select>
                    </div>
                  </div>
                )}
              </MotionDiv>

              {/* Terms */}
              <MotionDiv variants={fadeUp}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="relative mt-0.5">
                    <input type="checkbox" className="sr-only" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                    <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                      style={{ borderColor: agreed ? '#2EAF6F' : '#D1D5DB', background: agreed ? '#2EAF6F' : '#fff' }}>
                      {agreed && <CheckCircle size={12} color="#fff" />}
                    </div>
                  </div>
                  <span className="text-sm text-gray-600 leading-relaxed">
                    I agree to the{' '}
                    <Link to="/terms" className="font-semibold underline" style={{ color: '#2EAF6F' }}>Terms of Service</Link>
                    {' '}and{' '}
                    <Link to="/privacy" className="font-semibold underline" style={{ color: '#2EAF6F' }}>Privacy Policy</Link>.
                    I understand my trial is free for 30 days, after which I'll be charged {plan.price}{plan.period}.
                  </span>
                </label>
              </MotionDiv>

              {/* Submit */}
              <MotionDiv variants={fadeUp}>
                <button onClick={handleConfirm} disabled={!agreed || loading}
                  className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: agreed ? 'linear-gradient(135deg, #2EAF6F, #1d8a55)' : '#D1D5DB',
                    boxShadow: agreed ? '0 4px 20px rgba(46,175,111,0.35)' : 'none',
                    cursor: agreed ? 'pointer' : 'not-allowed',
                  }}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Processing…
                    </span>
                  ) : (
                    <>Start free trial <ArrowRight size={18} /></>
                  )}
                </button>
                <p className="text-center text-xs text-gray-400 mt-3 flex items-center justify-center gap-1">
                  <Lock size={11} /> Secured with 256-bit SSL encryption
                </p>
              </MotionDiv>
            </MotionDiv>

            {/* Right — order summary */}
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="lg:col-span-2">
              <MotionDiv variants={fadeUp} className="rounded-3xl p-6 sticky top-6"
                style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
                <div className="relative">
                  <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Order summary</p>

                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{plan.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{plan.region}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{plan.price}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{plan.period}</p>
                    </div>
                  </div>

                  {plan.saving && (
                    <div className="mb-4 px-3 py-2 rounded-xl text-xs font-bold" style={{ background: 'rgba(46,175,111,0.15)', color: '#2EAF6F' }}>
                      🎉 {plan.saving} vs monthly
                    </div>
                  )}

                  <div className="border-t border-white/10 pt-4 mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Today's charge</span>
                      <span className="font-bold" style={{ color: '#2EAF6F' }}>£0.00 (Free trial)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>After trial</span>
                      <span className="font-bold text-white">{plan.price}{plan.period}</span>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="text-xs font-bold mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>What's included</p>
                    <div className="flex flex-col gap-2">
                      {features.map((f, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <CheckCircle size={13} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                          <span className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-2">
                    <Shield size={14} style={{ color: '#2EAF6F' }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Cancel anytime. No questions asked.</span>
                  </div>
                </div>
              </MotionDiv>
            </MotionDiv>
          </div>
        </div>
      </div>
    </>
  );
}
