import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, ChevronLeft, ArrowRight, Shield } from 'lucide-react';
import { MotionDiv } from '@/lib/motion-safe';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

const tierConfig = {
  basic: {
    name: 'Basic',
    price: { GB: '£4.99', NG: '₦5,000' },
    region: { GB: '🇬🇧 United Kingdom', NG: '🇳🇬 Nigeria' },
    features: ['Join up to 3 savings groups', 'Cannot create a savings group', 'Trust Score™, governance and voting tools', 'Priority onboarding support'],
  },
  premium: {
    name: 'Premium',
    price: { GB: '£14.99', NG: '₦10,000' },
    region: { GB: '🇬🇧 United Kingdom', NG: '🇳🇬 Nigeria' },
    features: ['Create up to 3 savings groups', 'Join up to 5 more savings groups (8 total)', 'Trust Score™, governance and voting tools', 'Priority onboarding support'],
  },
} as const;

type TierKey = keyof typeof tierConfig;
type CountryCode = 'GB' | 'NG';

function resolveSelection(plan: string | null, tier: string | null, country: string | null): { tier: TierKey; country: CountryCode } {
  const resolvedTier = tier === 'premium' || plan?.includes('premium') ? 'premium' : 'basic';
  const resolvedCountry = country === 'NG' || plan?.startsWith('ng_') || plan?.startsWith('ng-') ? 'NG' : 'GB';
  return { tier: resolvedTier, country: resolvedCountry };
}

export default function SubscriptionConfirmPage() {
  const [searchParams] = useSearchParams();
  const selection = resolveSelection(
    searchParams.get('plan'),
    searchParams.get('tier'),
    searchParams.get('country'),
  );
  const plan = tierConfig[selection.tier];

  return (
    <>
      <Helmet>
        <title>Confirm Membership — PadiHub</title>
        <meta name="description" content="Review your monthly PadiHub membership plan before continuing to signup." />
        <link rel="canonical" href="https://padihub.com/subscription/confirm" />
        <meta property="og:title" content="Confirm Membership — PadiHub" />
        <meta property="og:description" content="Review your monthly PadiHub membership plan before continuing to signup." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="min-h-screen py-12 px-4" style={{ background: '#F9FAFB' }}>
        <div className="max-w-5xl mx-auto">
          <Link to="/pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 mb-8 transition-colors">
            <ChevronLeft size={16} /> Back to pricing
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="lg:col-span-3 flex flex-col gap-6">
              <MotionDiv variants={fadeUp}>
                <h1 className="text-2xl font-extrabold text-gray-900 mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>
                  Confirm your membership
                </h1>
                <p className="text-gray-500 text-sm">PadiHub memberships are monthly only. Complete signup to save your plan and add a verified payment method securely during onboarding.</p>
              </MotionDiv>

              <MotionDiv variants={fadeUp} className="rounded-2xl p-4 flex items-center gap-3" style={{ background: 'rgba(46,175,111,0.08)', border: '1px solid rgba(46,175,111,0.2)' }}>
                <CheckCircle size={20} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: '#2EAF6F' }}>Monthly billing only</p>
                  <p className="text-xs text-gray-500">Billing starts once you finish setup and add a verified payment method.</p>
                </div>
              </MotionDiv>

              <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>What's included</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2 rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                      <CheckCircle size={14} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </MotionDiv>

              <MotionDiv variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
                <Link
                  to="/get-started"
                  className="flex-1 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all hover:opacity-90"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.35)' }}
                >
                  Continue to signup <ArrowRight size={18} />
                </Link>
                <Link
                  to="/pricing"
                  className="flex-1 py-4 rounded-2xl font-bold text-gray-600 flex items-center justify-center hover:bg-gray-50 transition-colors"
                  style={{ border: '1px solid #E5E7EB' }}
                >
                  Review plans again
                </Link>
              </MotionDiv>
            </MotionDiv>

            <MotionDiv initial="hidden" animate="visible" variants={stagger} className="lg:col-span-2">
              <MotionDiv variants={fadeUp} className="rounded-3xl p-6 sticky top-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
                <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: '#2EAF6F' }} />
                <div className="relative">
                  <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>Plan summary</p>

                  <div className="flex items-center justify-between mb-4 gap-4">
                    <div>
                      <p className="font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{plan.name}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{plan.region[selection.country]}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{plan.price[selection.country]}</p>
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>per month</p>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4 mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Billing cadence</span>
                      <span className="font-bold text-white">Monthly</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Billing starts</span>
                      <span className="font-bold text-white">After payment setup</span>
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-4">
                    <p className="text-xs font-bold mb-3" style={{ color: 'rgba(255,255,255,0.4)' }}>Included</p>
                    <div className="flex flex-col gap-2">
                      {plan.features.map((feature) => (
                        <div key={feature} className="flex items-start gap-2">
                          <CheckCircle size={13} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                          <span className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-2">
                    <Shield size={14} style={{ color: '#2EAF6F' }} />
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Change plans later from your membership settings.</span>
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
