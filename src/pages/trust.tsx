import { useCallback, useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv, MotionCircle, MotionProgressBar } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Shield, CheckCircle, TrendingUp, Users, Award, Star,
  ArrowRight, HelpCircle, Zap, Globe, AlertCircle, XCircle,
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { SkeletonPage } from '@/components/ui/loading-skeleton';
import { getValidSession } from '@/lib/session';
import { getTrustTiers, getCurrentTier, type TrustTier } from '@/lib/trust-tiers';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/trust#webpage\",\"name\":\"Trust Score™ — PadiHub\",\"url\":\"https://padihub.com/trust\",\"description\":\"Build your reputation through positive community participation. View your Trust Score™ on PadiHub.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

interface UserStats {
  trust_score: number;
  trust_score_max: number;
  trust_score_min: number;
  identity_verified: boolean;
  communities_count: number;
  is_group_leader: boolean;
  contribution_reliability: number | null;
  contributions_paid_count: number;
  governance_participation: number | null;
  votes_cast_count: number;
  milestones: {
    joined_at: string | null;
    first_community_at: string | null;
    first_contribution_at: string | null;
    first_vote_at: string | null;
    identity_verified_at: string | null;
  };
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getApiErrorMessage(payload: unknown, fallback: string) {
  if (isRecord(payload) && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message;
  }
  return fallback;
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

function buildJourney(stats: UserStats, tiers: TrustTier[]) {
  const leaderTier = tiers.find(t => t.name === 'Leader');
  const championTier = tiers.find(t => t.name === 'Community Champion');

  return [
    { label: 'Joined PadiHub', date: formatDate(stats.milestones.joined_at), done: true, icon: Zap },
    { label: 'Identity Verified', date: formatDate(stats.milestones.identity_verified_at), done: stats.identity_verified, icon: CheckCircle },
    { label: 'First Community', date: formatDate(stats.milestones.first_community_at), done: Boolean(stats.milestones.first_community_at), icon: Users },
    { label: 'First Contribution', date: formatDate(stats.milestones.first_contribution_at), done: Boolean(stats.milestones.first_contribution_at), icon: Shield },
    { label: 'First Vote', date: formatDate(stats.milestones.first_vote_at), done: Boolean(stats.milestones.first_vote_at), icon: Star },
    { label: 'Community Leader', date: null, done: leaderTier ? stats.trust_score >= leaderTier.min : false, icon: Award },
    { label: 'Community Champion', date: null, done: championTier ? stats.trust_score >= championTier.min : false, icon: Star },
  ];
}

function buildRecommendations(stats: UserStats) {
  const recommendations: Array<{ title: string; desc: string; action: string; color: string; icon: typeof Shield; to: string }> = [];

  if (!stats.identity_verified) {
    recommendations.push({
      title: 'Verify your identity',
      desc: 'Confirm your identity to unlock full trust and access — worth +10 Trust',
      action: 'Go to profile', color: '#2EAF6F', icon: CheckCircle, to: '/profile',
    });
  }

  if (stats.communities_count === 0) {
    recommendations.push({
      title: 'Join or create a savings group',
      desc: 'Start saving with others — you earn +2 Trust for every contribution you pay on time',
      action: 'Explore groups', color: '#F59E0B', icon: Globe, to: '/savings-groups',
    });
  } else {
    recommendations.push({
      title: 'Keep your contributions on time',
      desc: 'Every on-time contribution adds +2 Trust; a missed contribution costs 5',
      action: 'View groups', color: '#8B5CF6', icon: Users, to: '/savings-groups',
    });
  }

  return recommendations;
}

/* ── Page ─────────────────────────────────────────────────────────────── */
export default function TrustScorePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<UserStats | null>(null);

  const loadStats = useCallback(async () => {
    const session = getValidSession();
    if (!session?.token) {
      setError('Please log in to view your Trust Score™.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await window.fetch('/api/users/stats', {
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const json = await response.json() as ApiResponse<UserStats>;
      if (!response.ok) {
        setError(getApiErrorMessage(json, 'We could not load your Trust Score™ right now.'));
        return;
      }
      setStats(json.data ?? null);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStats(); }, [loadStats]);

  if (loading) {
    return (
      <DashboardLayout>
        <SkeletonPage />
      </DashboardLayout>
    );
  }

  if (error || !stats) {
    return (
      <DashboardLayout>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto">
          <div className="rounded-2xl p-4 flex items-start gap-3" style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}>
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#DC2626' }} />
            <p className="text-sm font-medium" style={{ color: '#DC2626' }}>{error || 'We could not load your Trust Score™.'}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const currentScore = stats.trust_score;
  const scoreMax = stats.trust_score_max;
  const tiers = getTrustTiers(scoreMax);
  const currentTier = getCurrentTier(currentScore, tiers);
  const nextTier = tiers[tiers.indexOf(currentTier) + 1];
  const progressToNext = nextTier ? Math.round(((currentScore - currentTier.min) / (nextTier.min - currentTier.min)) * 100) : 100;

  const kpis = [
    { label: 'Trust Score™', value: `${currentScore}`, color: '#2EAF6F', icon: Shield },
    { label: 'Trust Tier', value: currentTier.name, color: '#F59E0B', icon: Award },
    { label: 'Contribution Reliability', value: stats.contribution_reliability !== null ? `${stats.contribution_reliability}%` : '—', color: '#2eafaf', icon: CheckCircle },
    { label: 'Governance Participation', value: stats.governance_participation !== null ? `${stats.governance_participation}%` : '—', color: '#8B5CF6', icon: Users },
    { label: 'Communities', value: `${stats.communities_count}`, color: '#2EAF6F', icon: Globe },
    { label: 'Verification', value: stats.identity_verified ? 'Verified' : 'Not verified', color: stats.identity_verified ? '#2EAF6F' : '#9CA3AF', icon: stats.identity_verified ? CheckCircle : XCircle },
  ];

  const journey = buildJourney(stats, tiers);
  const recommendations = buildRecommendations(stats);

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
            <Link to="/trust/history"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              View history
            </Link>
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
                    animate={{ strokeDashoffset: 2 * Math.PI * 60 * (1 - (scoreMax > 0 ? currentScore / scoreMax : 0)) }}
                    transition={{ duration: 1.5, ease: 'easeOut' as const }}
                    transform="rotate(-90 72 72)" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{currentScore}</span>
                  <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>/ {scoreMax}</span>
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                  <span className="text-2xl font-extrabold" style={{ color: currentTier.color, fontFamily: 'Nunito, sans-serif' }}>
                    {currentTier.name}
                  </span>
                  {stats.identity_verified && <CheckCircle size={18} style={{ color: '#2EAF6F' }} />}
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
                  <span
                    className="text-xs font-bold px-3 py-1.5 rounded-full"
                    style={{
                      background: stats.identity_verified ? 'rgba(46,175,111,0.2)' : 'rgba(156,163,175,0.2)',
                      color: stats.identity_verified ? '#2EAF6F' : '#9CA3AF',
                    }}
                  >
                    {stats.identity_verified ? '✓ Verified member' : 'Not yet verified'}
                  </span>
                </div>
              </div>
            </div>
          </MotionDiv>

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
                      <p className="text-xs text-gray-400 mt-0.5">{t.min}–{t.max}</p>
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
                      <p className="text-xs text-gray-400">{j.date ?? (j.done ? '' : 'Not yet')}</p>
                    </div>
                    {j.done && <CheckCircle size={14} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 4 }} />}
                  </div>
                ))}
              </div>
            </MotionDiv>

            {/* Recommendations */}
            <MotionDiv variants={fadeUp} className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6' }}>
              <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Boost your score</h2>
              {recommendations.length === 0 ? (
                <p className="text-sm text-gray-500">You're doing great — keep participating to grow your Trust Score™.</p>
              ) : (
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
              )}
            </MotionDiv>
          </div>

          {/* How it works */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-5 mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl opacity-15" style={{ background: '#2EAF6F' }} />
            <div className="relative flex items-start gap-3">
              <HelpCircle size={20} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 1 }} />
              <div>
                <p className="font-extrabold text-white mb-1" style={{ fontFamily: 'Nunito, sans-serif' }}>How Trust Score™ works</p>
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Trust grows through positive participation and reliability: +2 for every on-time contribution,
                  +3 when a savings cycle completes in your favour, and +10 for verifying your identity.
                  Missing a contribution costs 5 points, and being suspended from a group costs 10.
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
