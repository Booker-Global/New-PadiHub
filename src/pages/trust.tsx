import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv, MotionCircle, MotionProgressBar } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Shield, CheckCircle, TrendingUp, Users, Award, Star,
  ArrowRight, Share2, HelpCircle, Zap, Globe
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/trust#webpage\",\"name\":\"Trust Score™ — PadiHub\",\"url\":\"https://padihub.com/trust\",\"description\":\"Build your reputation through positive community participation. View your Trust Score™ on PadiHub.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

/* ── Tiers ────────────────────────────────────────────────────────────── */
const tiers = [
  { name: 'Explorer',           range: '0–299',   color: '#9CA3AF', desc: 'Just getting started',          min: 0,   max: 299 },
  { name: 'Builder',            range: '300–499', color: '#2eafaf', desc: 'Building your reputation',      min: 300, max: 499 },
  { name: 'Trusted',            range: '500–699', color: '#2EAF6F', desc: 'Consistently reliable',         min: 500, max: 699 },
  { name: 'Respected',          range: '700–849', color: '#F59E0B', desc: 'Highly regarded member',        min: 700, max: 849 },
  { name: 'Leader',             range: '850–949', color: '#8B5CF6', desc: 'Community leader',              min: 850, max: 949 },
  { name: 'Community Champion', range: '950–1000',color: '#EF4444', desc: 'Elite community champion',      min: 950, max: 1000 },
];

const currentScore = 847;
const currentTier = tiers.find(t => currentScore >= t.min && currentScore <= t.max) ?? tiers[3];
const nextTier = tiers[tiers.indexOf(currentTier) + 1];
const progressToNext = nextTier ? Math.round(((currentScore - currentTier.min) / (nextTier.min - currentTier.min)) * 100) : 100;

/* ── KPIs ─────────────────────────────────────────────────────────────── */
const kpis = [
  { label: 'Trust Score™',           value: '847',  color: '#2EAF6F', icon: Shield },
  { label: 'Trust Tier',             value: 'Respected', color: '#F59E0B', icon: Award },
  { label: 'Contribution Reliability',value: '96%', color: '#2eafaf', icon: CheckCircle },
  { label: 'Governance Participation',value: '78%', color: '#8B5CF6', icon: Users },
  { label: 'Communities',            value: '4',    color: '#2EAF6F', icon: Globe },
  { label: 'Verification',           value: 'Verified', color: '#2EAF6F', icon: CheckCircle },
];

/* ── Journey ──────────────────────────────────────────────────────────── */
const journey = [
  { label: 'Joined PadiHub',      date: 'Jan 2026', done: true,  icon: Zap },
  { label: 'Profile Verified',    date: 'Jan 2026', done: true,  icon: CheckCircle },
  { label: 'First Community',     date: 'Feb 2026', done: true,  icon: Users },
  { label: 'First Contribution',  date: 'Feb 2026', done: true,  icon: Shield },
  { label: 'First Vote',          date: 'Mar 2026', done: true,  icon: Star },
  { label: 'Community Leader',    date: 'Coming',   done: false, icon: Award },
  { label: 'Community Champion',  date: 'Coming',   done: false, icon: Star },
];

/* ── Recommendations ─────────────────────────────────────────────────── */
const recommendations = [
  { title: 'Make a contribution',       desc: 'Contribute to your savings group to earn +15 Trust',    action: 'Contribute now', color: '#8B5CF6', icon: Users,       to: '/savings-groups' },
  { title: 'Complete your profile',     desc: 'Add a bio and profile photo for +10 Trust',             action: 'Update profile', color: '#2EAF6F', icon: CheckCircle, to: '/profile/edit' },
  { title: 'Create a savings group',    desc: 'Start a new group to earn +20 Trust',                   action: 'Create now',     color: '#F59E0B', icon: Zap,         to: '/savings-groups/create' },
  { title: 'Join a savings group',      desc: 'Expand your savings network for +12 Trust',             action: 'Explore',        color: '#2eafaf', icon: Globe,       to: '/savings-groups' },
];

/* ── Activity ─────────────────────────────────────────────────────────── */
const activity = [
  { text: 'Contribution completed — Monthly Ajo Pool',  date: 'Jun 18', change: '+8',  color: '#2EAF6F', icon: CheckCircle },
  { text: 'Governance vote submitted',                  date: 'Jun 15', change: '+5',  color: '#8B5CF6', icon: Users },
  { text: 'New community joined — Diaspora Builders',   date: 'Jun 10', change: '+12', color: '#2eafaf', icon: Globe },
  { text: 'Profile verification completed',             date: 'Jun 5',  change: '+20', color: '#2EAF6F', icon: CheckCircle },
  { text: 'Contribution completed — Emergency Fund',    date: 'Jun 1',  change: '+8',  color: '#2EAF6F', icon: CheckCircle },
];

/* ── Achievements ─────────────────────────────────────────────────────── */
const achievements = [
  { title: 'First Contribution',    unlocked: true,  color: '#2EAF6F', icon: CheckCircle },
  { title: 'Reliable Member',       unlocked: true,  color: '#F59E0B', icon: Award },
  { title: 'Verified Member',       unlocked: true,  color: '#2EAF6F', icon: Shield },
  { title: 'Trusted Contributor',   unlocked: true,  color: '#2eafaf', icon: Star },
  { title: 'Community Builder',     unlocked: false, color: '#8B5CF6', icon: Users },
  { title: 'Community Champion',    unlocked: false, color: '#EF4444', icon: Award },
];

export default function TrustScorePage() {
  const [showShare, setShowShare] = useState(false);

  return (
    <DashboardLayout>
      <Helmet>
        <title>Trust Score™ — PadiHub</title>
        <meta name="description" content="Build your reputation through positive community participation. View your Trust Score™ on PadiHub." />
        <link rel="canonical" href="https://padihub.com/trust" />
              <meta property="og:title" content="Trust Score™ — PadiHub" />
        <meta property="og:description" content="Build your reputation through positive community participation. View your Trust Score™ on PadiHub." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Header */}
          <MotionDiv variants={fadeUp} className="flex items-start justify-between gap-3 mb-6">
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Score™</h1>
              <p className="text-gray-500 text-sm mt-1">Build your reputation through positive community participation.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowShare(v => !v)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold transition-all"
                style={{ background: '#F3F4F6', color: '#6B7280' }}>
                <Share2 size={15} /> Share
              </button>
              <Link to="/trust/history"
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                View history
              </Link>
            </div>
          </MotionDiv>

          {/* Hero card */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-56 h-56 rounded-full blur-3xl opacity-15" style={{ background: currentTier.color }} />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />
            <div className="relative r-hero" style={{ alignItems: 'center' }}>
              {/* Score ring */}
              <div className="relative w-36 h-36 flex-shrink-0">
                <svg width="144" height="144" viewBox="0 0 144 144">
                  <circle cx="72" cy="72" r="60" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                  <MotionCircle cx="72" cy="72" r="60" fill="none" stroke={currentTier.color} strokeWidth="10"
                    strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 60}`}
                    animate={{ strokeDashoffset: 2 * Math.PI * 60 * (1 - currentScore / 1000) }}
                    transition={{ duration: 1.5, ease: 'easeOut' as const }}
                    transform="rotate(-90 72 72)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{currentScore}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>/ 1000</span>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                  <span className="text-2xl font-extrabold" style={{ color: currentTier.color, fontFamily: 'Nunito, sans-serif' }}>
                    {currentTier.name}
                  </span>
                  <CheckCircle size={18} style={{ color: '#2EAF6F' }} />
                </div>
                <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.5)' }}>{currentTier.desc}</p>

                {nextTier && (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>Progress to {nextTier.name}</span>
                      <span className="font-bold" style={{ color: nextTier.color }}>{progressToNext}%</span>
                    </div>
                    <div className="h-2 rounded-full mb-1" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <MotionProgressBar className="h-2 rounded-full" animate={{ width: `${progressToNext}%` }}
                        transition={{ duration: 1, delay: 0.5, ease: 'easeOut' as const }}
                        style={{ background: `linear-gradient(90deg, ${currentTier.color}, ${nextTier.color})` }} />
                    </div>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {nextTier.min - currentScore} points to reach {nextTier.name}
                    </p>
                  </div>
                )}

                <div className="flex items-center gap-3 mt-4 justify-center md:justify-start">
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F' }}>
                    ✓ Verified member
                  </span>
                  <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}>
                    ↑ +45 this month
                  </span>
                </div>
              </div>
            </div>
          </MotionDiv>

          {/* Share card */}
          {showShare && (
            <MotionDiv initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="rounded-3xl p-5 mb-6 bg-white" style={{ border: '1px solid #E5E7EB' }}>
              <p className="font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Share your Trust Score™</p>
              <div className="flex items-center gap-3 p-3 rounded-2xl mb-3" style={{ background: '#F9FAFB' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>A</div>
                <div>
                  <p className="font-bold text-gray-900 text-sm">Amara Okonkwo</p>
                  <p className="text-xs text-gray-400">Trust Score™ {currentScore} · {currentTier.name} · Verified</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-xl font-black" style={{ color: currentTier.color, fontFamily: 'Nunito, sans-serif' }}>{currentScore}</p>
                  <p className="text-xs text-gray-400">PadiHub</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white hover:opacity-90 transition-all"
                  style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                  Share Passport™
                </button>
                <button className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all hover:bg-gray-100"
                  style={{ background: '#F3F4F6', color: '#6B7280' }}>
                  Copy link
                </button>
              </div>
            </MotionDiv>
          )}

          {/* KPI cards */}
          <MotionDiv variants={fadeUp} className="r-grid-3" style={{ marginBottom: 32 }}>
            {kpis.map(k => (
              <div key={k.label} className="rounded-2xl p-4 bg-white text-center"
                style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                <k.icon size={16} style={{ color: k.color, margin: '0 auto 6px' }} />
                <p className="text-base font-black" style={{ color: k.color, fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                <p className="text-xs text-gray-500 leading-tight">{k.label}</p>
              </div>
            ))}
          </MotionDiv>

          {/* Tier journey */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 bg-white mb-6" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Tiers</h2>
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              {tiers.map((t, i) => {
                const isActive = t.name === currentTier.name;
                const isPast = tiers.indexOf(t) < tiers.indexOf(currentTier);
                return (
                  <div key={t.name} className="flex items-center flex-shrink-0">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all"
                        style={{
                          background: isActive ? `linear-gradient(135deg, ${t.color}, ${t.color}cc)` : isPast ? `${t.color}20` : '#F3F4F6',
                          color: isActive ? '#fff' : isPast ? t.color : '#9CA3AF',
                          boxShadow: isActive ? `0 4px 16px ${t.color}40` : 'none',
                          border: isActive ? `2px solid ${t.color}` : 'none',
                        }}>
                        {isPast ? <CheckCircle size={18} /> : <Shield size={16} />}
                      </div>
                      <p className="text-xs font-bold mt-2 text-center max-w-16 leading-tight"
                        style={{ color: isActive ? t.color : isPast ? '#6B7280' : '#9CA3AF' }}>
                        {t.name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.range}</p>
                    </div>
                    {i < tiers.length - 1 && (
                      <div className="w-8 h-0.5 mx-1 flex-shrink-0"
                        style={{ background: isPast ? t.color : '#E5E7EB' }} />
                    )}
                  </div>
                );
              })}
            </div>
          </MotionDiv>

          <div className="r-grid-2" style={{ marginBottom: 24 }}>
            {/* Trust journey */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Journey</h2>
              <div className="flex flex-col gap-0">
                {journey.map((j, i) => (
                  <div key={i} className="flex items-start gap-3 relative">
                    {i < journey.length - 1 && (
                      <div className="absolute left-4 top-9 bottom-0 w-0.5" style={{ background: j.done ? '#2EAF6F20' : '#F3F4F6' }} />
                    )}
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10"
                      style={{
                        background: j.done ? 'rgba(46,175,111,0.1)' : '#F3F4F6',
                        border: j.done ? '1px solid rgba(46,175,111,0.2)' : '1px solid #E5E7EB',
                      }}>
                      <j.icon size={13} style={{ color: j.done ? '#2EAF6F' : '#9CA3AF' }} />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-sm font-semibold" style={{ color: j.done ? '#1A1A2E' : '#9CA3AF' }}>{j.label}</p>
                      <p className="text-xs text-gray-400">{j.date}</p>
                    </div>
                    {j.done && <CheckCircle size={14} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 4 }} />}
                  </div>
                ))}
              </div>
            </MotionDiv>

            {/* Recommendations */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Boost your score</h2>
              <div className="flex flex-col gap-3">
                {recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-2xl"
                    style={{ background: `${r.color}06`, border: `1px solid ${r.color}15` }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${r.color}15` }}>
                      <r.icon size={15} style={{ color: r.color }} />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">{r.title}</p>
                      <p className="text-xs text-gray-500">{r.desc}</p>
                    </div>
                    <Link to={r.to} className="text-xs font-bold flex items-center gap-1 flex-shrink-0"
                      style={{ color: r.color }}>
                      {r.action} <ArrowRight size={11} />
                    </Link>
                  </div>
                ))}
              </div>
            </MotionDiv>
          </div>

          {/* Recent activity */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white mb-6" style={{ border: '1px solid #F3F4F6' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent Trust Activity</h2>
              <Link to="/trust/history" className="text-xs font-bold" style={{ color: '#2EAF6F' }}>View all →</Link>
            </div>
            <div className="flex flex-col gap-0">
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 relative">
                  {i < activity.length - 1 && (
                    <div className="absolute left-4 top-9 bottom-0 w-0.5" style={{ background: '#F3F4F6' }} />
                  )}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-white"
                    style={{ border: `1px solid ${a.color}25` }}>
                    <a.icon size={13} style={{ color: a.color }} />
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm text-gray-700">{a.text}</p>
                    <p className="text-xs text-gray-400">{a.date}</p>
                  </div>
                  <span className="text-xs font-black flex-shrink-0 mt-0.5" style={{ color: '#2EAF6F' }}>{a.change}</span>
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* Achievements */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white mb-6" style={{ border: '1px solid #F3F4F6' }}>
            <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Trust Achievements</h2>
            <div className="r-grid-3">
              {achievements.map((a, i) => (
                <div key={i} className="rounded-2xl p-4 text-center"
                  style={{
                    background: a.unlocked ? `${a.color}08` : '#F9FAFB',
                    border: a.unlocked ? `1px solid ${a.color}20` : '1px solid #E5E7EB',
                    opacity: a.unlocked ? 1 : 0.6,
                  }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: a.unlocked ? `linear-gradient(135deg, ${a.color}, ${a.color}cc)` : '#E5E7EB' }}>
                    <a.icon size={16} color={a.unlocked ? '#fff' : '#9CA3AF'} />
                  </div>
                  <p className="text-xs font-bold text-gray-700 leading-tight">{a.title}</p>
                  <p className="text-xs mt-1" style={{ color: a.unlocked ? a.color : '#9CA3AF' }}>
                    {a.unlocked ? '✓ Earned' : 'Locked'}
                  </p>
                </div>
              ))}
            </div>
          </MotionDiv>

          {/* How it works */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-15" style={{ background: '#2EAF6F' }} />
            <div className="relative flex items-start gap-3">
              <HelpCircle size={20} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="font-extrabold text-white mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>How Trust Score™ works</p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Trust grows through positive participation, reliability, transparency and community engagement.
                  Every contribution, vote and community action builds your reputation.
                </p>
              </div>
            </div>
          </MotionDiv>

          {/* Four pillars */}
          <MotionDiv variants={fadeUp} className="flex flex-wrap justify-center gap-3">
            {[
              { label: 'Trust',        color: '#2EAF6F', icon: Shield },
              { label: 'Transparency', color: '#2eafaf', icon: Globe },
              { label: 'Community',    color: '#8B5CF6', icon: Users },
              { label: 'Progress',     color: '#F59E0B', icon: TrendingUp },
            ].map(pill => (
              <div key={pill.label} className="flex items-center gap-2 px-4 py-2 rounded-full"
                style={{ background: `${pill.color}08`, border: `1px solid ${pill.color}20` }}>
                <pill.icon size={13} style={{ color: pill.color }} />
                <span className="text-xs font-bold text-gray-600">{pill.label}</span>
              </div>
            ))}
          </MotionDiv>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
