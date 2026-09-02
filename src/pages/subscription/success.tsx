import { useEffect, useMemo, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, ArrowRight, Users, Shield, Award, Globe } from 'lucide-react';
import { MotionDiv } from '@/lib/motion-safe';

const fadeUp = { hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const tierConfig = {
  basic: { name: 'Basic', price: { GB: '£4.99', NG: '₦5,000' } },
  premium: { name: 'Premium', price: { GB: '£14.99', NG: '₦10,000' } },
} as const;

type TierKey = keyof typeof tierConfig;
type CountryCode = 'GB' | 'NG';

const nextSteps = [
  { icon: Users, title: 'View savings groups', desc: 'Browse and join savings groups in your community.', href: '/savings-groups', color: '#2EAF6F' },
  { icon: Shield, title: 'Build your Trust Score™', desc: 'Start contributing and watch your reputation grow.', href: '/trust', color: '#2eafaf' },
  { icon: Globe, title: 'Complete your profile', desc: 'Add your details and preferences to get the most from PadiHub.', href: '/profile/edit', color: '#8B5CF6' },
  { icon: Award, title: 'Create a savings group', desc: 'Set up your first group and invite your community.', href: '/savings-groups/create', color: '#F59E0B' },
];

function resolveSelection(plan: string | null, tier: string | null, country: string | null): { tier: TierKey; country: CountryCode } {
  const resolvedTier = tier === 'premium' || plan?.includes('premium') ? 'premium' : 'basic';
  const resolvedCountry = country === 'NG' || plan?.startsWith('ng_') || plan?.startsWith('ng-') ? 'NG' : 'GB';
  return { tier: resolvedTier, country: resolvedCountry };
}

export default function SubscriptionSuccessPage() {
  const [searchParams] = useSearchParams();
  const [confetti, setConfetti] = useState(false);
  const mode = searchParams.get('mode') ?? 'confirmed';
  const selection = useMemo(() => resolveSelection(
    searchParams.get('plan'),
    searchParams.get('tier'),
    searchParams.get('country'),
  ), [searchParams]);
  const plan = tierConfig[selection.tier];
  const heading = mode === 'reactivated' ? 'Membership reactivated' : 'Membership confirmed';
  const subheading = mode === 'reactivated'
    ? `Your ${plan.name} plan is active again at ${plan.price[selection.country]} per month.`
    : `Your ${plan.name} membership is ready at ${plan.price[selection.country]} per month.`;
  const helperText = mode === 'reactivated'
    ? 'A confirmation email is on its way.'
    : 'You can now continue setting up your account and payment details.';

  useEffect(() => {
    setConfetti(true);
    const timeout = window.setTimeout(() => setConfetti(false), 3000);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <>
      <Helmet>
        <title>Welcome to PadiHub! — Membership Confirmed</title>
        <meta name="description" content="Your PadiHub membership is confirmed." />
        <link rel="canonical" href="https://padihub.com/subscription/success" />
        <meta property="og:title" content="Welcome to PadiHub! — Membership Confirmed" />
        <meta property="og:description" content="Your PadiHub membership is confirmed." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className="min-h-screen flex flex-col items-center justify-center py-16 px-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div className="absolute top-0 left-0 w-96 h-96 rounded-full blur-3xl opacity-20 animate-pulse" style={{ background: '#2EAF6F' }} />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-15 animate-pulse" style={{ background: '#F59E0B', animationDelay: '1s' }} />

        {confetti && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from({ length: 24 }).map((_, index) => (
              <MotionDiv
                key={index}
                initial={{ y: -20, x: `${Math.random() * 100}%`, opacity: 1, rotate: 0 }}
                animate={{ y: '110vh', opacity: 0, rotate: Math.random() * 720 - 360 }}
                transition={{ duration: 2.5 + Math.random(), delay: Math.random() * 0.8, ease: 'easeIn' as const }}
                className="absolute w-3 h-3 rounded-sm"
                style={{ background: ['#2EAF6F', '#F59E0B', '#8B5CF6', '#2eafaf', '#EF4444'][index % 5] }}
              />
            ))}
          </div>
        )}

        <div className="relative max-w-2xl w-full text-center">
          <MotionDiv initial="hidden" animate="visible" variants={stagger}>
            <MotionDiv variants={fadeUp} className="flex justify-center mb-6">
              <MotionDiv
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 60px rgba(46,175,111,0.5)' }}
              >
                <CheckCircle size={48} color="#fff" />
              </MotionDiv>
            </MotionDiv>

            <MotionDiv variants={fadeUp} className="text-sm font-bold uppercase tracking-widest mb-3" style={{ color: '#2EAF6F' }}>
              Welcome to PadiHub
            </MotionDiv>
            <h1 className="sr-only">{heading} — Welcome to PadiHub</h1>
            <MotionDiv variants={fadeUp} className="text-4xl md:text-5xl font-extrabold text-white mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>
              {heading}
            </MotionDiv>
            <MotionDiv variants={fadeUp} className="text-gray-300 text-lg mb-2">
              {subheading}
            </MotionDiv>
            <MotionDiv variants={fadeUp} className="text-gray-500 text-sm mb-10">
              {helperText}
            </MotionDiv>

            <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-10 relative overflow-hidden mx-auto max-w-sm" style={{ background: 'linear-gradient(135deg, #1A2E1A, #0F2A1A)', border: '1px solid rgba(46,175,111,0.3)' }}>
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-30" style={{ background: '#2EAF6F' }} />
              <div className="relative flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.2)' }}>
                    <Shield size={16} style={{ color: '#2EAF6F' }} />
                  </div>
                  <span className="font-extrabold text-white text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>PadiHub</span>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full" style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F' }}>
                  ✓ Active
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-1">Plan</p>
              <p className="font-bold text-white mb-3">{plan.name}</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">Billing</p>
                  <p className="font-bold text-white text-sm">{plan.price[selection.country]} / month</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-bold text-white text-sm">{mode === 'reactivated' ? 'Reactivated' : 'Confirmed'}</p>
                </div>
              </div>
            </MotionDiv>

            <MotionDiv variants={fadeUp} className="mb-8">
              <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-5">What to do next</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                {nextSteps.map((step) => (
                  <Link
                    key={step.title}
                    to={step.href}
                    className="rounded-2xl p-4 flex items-start gap-3 hover:-translate-y-0.5 transition-all duration-200"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${step.color}20` }}>
                      <step.icon size={18} style={{ color: step.color }} />
                    </div>
                    <div>
                      <p className="font-bold text-white text-sm mb-0.5">{step.title}</p>
                      <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{step.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </MotionDiv>

            <MotionDiv variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/dashboard"
                className="px-8 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.4)' }}
              >
                Go to dashboard <ArrowRight size={18} />
              </Link>
              <Link
                to="/subscription/manage"
                className="px-8 py-4 rounded-2xl font-bold border border-white/20 text-white hover:bg-white/10 transition-all flex items-center justify-center"
              >
                Manage membership
              </Link>
            </MotionDiv>
          </MotionDiv>
        </div>
      </div>
    </>
  );
}
