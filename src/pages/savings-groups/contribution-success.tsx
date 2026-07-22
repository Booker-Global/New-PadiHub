import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { MotionProgressBar } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import { CheckCircle, Shield, Award, TrendingUp, Users, Zap } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

const streakDots = [true, true, true, true, true, false, false, false, false, false];

export default function ContributionSuccessPage() {
  // Start false so SSR and first client render produce identical markup.
  // Confetti is enabled in useEffect (client-only) to avoid hydration mismatch
  // from Math.random() producing different values on server vs client.
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Contribution Recorded — PadiHub</title>
        <meta name="description" content="Your contribution has been recorded. Thank you for strengthening your community." />
        <link rel="canonical" href="https://padihub.com/savings-groups/contribution-success" />
              <meta property="og:title" content="Contribution Recorded — PadiHub" />
        <meta property="og:description" content="Your contribution has been recorded. Thank you for strengthening your community." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        {/* Confetti particles */}
        {showConfetti && (
          <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
            {Array.from({ length: 24 }).map((_, i) => (
              <MotionDiv key={i}
                className="absolute w-2 h-2 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '-8px',
                  background: ['#2EAF6F', '#F59E0B', '#8B5CF6', '#2eafaf', '#EF4444'][i % 5],
                }}
                animate={{ y: ['0vh', '110vh'], rotate: [0, 360 * (Math.random() > 0.5 ? 1 : -1)], opacity: [1, 0] }}
                transition={{ duration: 2 + Math.random(), delay: Math.random() * 0.8, ease: 'easeIn' as const }} />
            ))}
          </div>
        )}

        <MotionDiv initial="hidden" animate="visible" variants={stagger} className="text-center">

          {/* Success icon */}
          <MotionDiv variants={fadeUp}>
            <MotionDiv
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
              className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 0 50px rgba(46,175,111,0.4)' }}>
              <CheckCircle size={44} color="#fff" />
            </MotionDiv>
          </MotionDiv>

          <MotionDiv variants={fadeUp}>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Contribution Recorded!
            </h1>
            <p className="text-gray-500 mb-1">Thank you for strengthening your community.</p>
            <p className="text-sm text-gray-400 mb-8">Monthly Ajo Pool · Lagos Savers Circle</p>
          </MotionDiv>

          {/* Unlocked updates */}
          <MotionDiv variants={fadeUp} className="grid grid-cols-2 gap-4 mb-8">
            {[
              { label: 'Trust Score™',     value: '+8',    sub: 'Now 855',   color: '#2EAF6F', icon: Shield },
              { label: 'Community Karma™', value: '+25',   sub: 'Now 1,265', color: '#F59E0B', icon: Award },
              { label: 'Contribution Streak',value: '6',   sub: 'months',    color: '#8B5CF6', icon: Zap },
              { label: 'Group Progress',   value: '+1%',   sub: 'Now 65%',   color: '#2eafaf', icon: TrendingUp },
            ].map(u => (
              <div key={u.label} className="rounded-2xl p-4 text-center"
                style={{ background: `${u.color}08`, border: `1px solid ${u.color}20` }}>
                <u.icon size={16} style={{ color: u.color, margin: '0 auto 6px' }} />
                <p className="text-2xl font-black" style={{ color: u.color, fontFamily: 'Nunito, sans-serif' }}>{u.value}</p>
                <p className="text-xs font-bold text-gray-700">{u.label}</p>
                <p className="text-xs text-gray-400">{u.sub}</p>
              </div>
            ))}
          </MotionDiv>

          {/* Streak */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-6 bg-white" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Contribution Streak</p>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', color: '#8B5CF6' }}>
                🔥 6 months
              </span>
            </div>
            <div className="flex gap-2 justify-center mb-2">
              {streakDots.map((active, i) => (
                <div key={i} className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                  style={{
                    background: active ? 'linear-gradient(135deg, #8B5CF6, #7C3AED)' : '#F3F4F6',
                    color: active ? '#fff' : '#9CA3AF',
                    boxShadow: active ? '0 2px 8px rgba(139,92,246,0.3)' : 'none',
                  }}>
                  {active ? <CheckCircle size={14} /> : i + 1}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center">4 more contributions to unlock the <strong>Reliable Member</strong> badge</p>
          </MotionDiv>

          {/* Community progress */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-8 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-20" style={{ background: '#2EAF6F' }} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} style={{ color: '#2EAF6F' }} />
                <p className="font-extrabold text-white text-sm" style={{ fontFamily: 'Nunito, sans-serif' }}>Community impact</p>
              </div>
              <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Your contribution brings Monthly Ajo Pool to <strong className="text-white">65%</strong> of its goal.
              </p>
              <div className="h-2 rounded-full mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <MotionProgressBar className="h-2 rounded-full" initial={{ width: '64%' }} animate={{ width: '65%' }}
                  transition={{ duration: 0.8, ease: 'easeOut' as const }}
                  style={{ background: 'linear-gradient(90deg, #2EAF6F, #F59E0B)' }} />
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>₦325,000 of ₦500,000</p>
            </div>
          </MotionDiv>

          {/* Actions */}
          <MotionDiv variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
            <Link to="/dashboard"
              className="flex-1 py-3.5 rounded-2xl font-bold text-white text-center transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 16px rgba(46,175,111,0.3)' }}>
              Return to dashboard
            </Link>
            <Link to="/savings-groups/monthly-ajo-pool"
              className="flex-1 py-3.5 rounded-2xl font-bold text-gray-700 text-center hover:bg-gray-50 transition-colors"
              style={{ border: '1px solid #E5E7EB' }}>
              View group
            </Link>
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
