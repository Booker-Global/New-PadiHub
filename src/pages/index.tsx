import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { useEffect, useState } from 'react';
import {
  ArrowRight, Shield, Users, TrendingUp, Star, CheckCircle,
  Zap, Globe, ChevronRight, Play, Heart, Sparkles, PiggyBank, Bell, Plus
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getValidSession } from '@/lib/session';
import GroupSearch from '@/components/GroupSearch';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@graph\":[{\"@type\":\"WebSite\",\"@id\":\"https://padihub.com/#website\",\"name\":\"PadiHub\",\"url\":\"https://padihub.com/\"},{\"@type\":\"Organization\",\"@id\":\"https://padihub.com/#organization\",\"name\":\"PadiHub\",\"url\":\"https://padihub.com/\",\"logo\":\"https://padihub.com/airo-assets/images/logo/primary\"},{\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/#webpage\",\"url\":\"https://padihub.com/\",\"name\":\"PadiHub — Save Together. Grow Together. Belong.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"},\"datePublished\":\"2026-07-16\",\"dateModified\":\"2026-07-16\"},{\"@type\":\"SoftwareApplication\",\"name\":\"PadiHub\",\"applicationCategory\":\"FinanceApplication\",\"operatingSystem\":\"Web\",\"offers\":{\"@type\":\"Offer\",\"price\":\"4.99\",\"priceCurrency\":\"GBP\"}}]}";

type Region = 'UK' | 'NG' | 'BOTH';

const regionCopy: Record<Region, { hero: string; illustration: string; trustBar: string; pricing: string; finalCta: string; }> = {
  UK: {
    hero: 'Built for members saving together in the United Kingdom.',
    illustration: 'Built for members in the United Kingdom',
    trustBar: 'United Kingdom pricing',
    pricing: 'Showing monthly-only membership options for the United Kingdom. Cancel anytime.',
    finalCta: 'Monthly-only plans · United Kingdom pricing shown',
  },
  NG: {
    hero: 'Built for members saving together in Nigeria.',
    illustration: 'Built for members in Nigeria',
    trustBar: 'Nigeria pricing',
    pricing: 'Showing monthly-only membership options for Nigeria. Cancel anytime.',
    finalCta: 'Monthly-only plans · Nigeria pricing shown',
  },
  BOTH: {
    hero: 'Built for members saving together in community circles of all kinds.',
    illustration: 'Built for community savings groups',
    trustBar: 'Region-aware pricing',
    pricing: 'Choose the monthly-only membership option that fits your region. Cancel anytime.',
    finalCta: 'Monthly-only plans · Choose the region that fits your group',
  },
};

function usePricingRegion(): Region {
  const [region, setRegion] = useState<Region>('BOTH');
  useEffect(() => {
    // Only fetch geo after hydration — never during SSR or first client render
    window.fetch('/api/geo')
      .then(r => r.json())
      .then(data => { if (data?.region) setRegion(data.region); })
      .catch(() => setRegion('BOTH'));
  }, []);
  return region;
}



// ── Auth state hook ──────────────────────────────────────────────────────────
// IMPORTANT: `isMounted` must start `false` and only flip to `true` inside a
// useEffect. This guarantees the first client render is identical to the SSR
// output (both see isLoggedIn=false / isMounted=false), preventing hydration
// error #418 which fires when the server and client produce different DOM trees.
//
// Uses getValidSession() (src/lib/session.ts) — the single source of truth for
// session/JWT-expiry — rather than re-parsing localStorage/sessionStorage here,
// so an expired token is treated as logged-out just like on /dashboard.
function useAuthUser(): { isMounted: boolean; isLoggedIn: boolean; name: string; trust: number; token: string } {
  const [state, setState] = useState<{ isMounted: boolean; isLoggedIn: boolean; name: string; trust: number; token: string }>({
    isMounted: false, isLoggedIn: false, name: '', trust: 0, token: '',
  });
  useEffect(() => {
    // This effect runs only in the browser, after hydration is complete.
    const session = getValidSession();
    if (session?.token) {
      setState({ isMounted: true, isLoggedIn: true, name: session.name || 'Member', trust: session.trust ?? 0, token: session.token });
      return;
    }
    setState(s => ({ ...s, isMounted: true }));
  }, []);
  return state;
}

// ── Mini Dashboard Card (logged-in only) ─────────────────────────────────────
// Pulls the same real data as /dashboard (same API endpoints) instead of the
// previous hardcoded "Lagos Savers Circle" demo group — a logged-in member
// with no groups/contributions must see that here too, not a fake preview.
interface PreviewGroup {
  id: string;
  name: string;
  currency: string;
  contribution_amount: string | number;
  contribution_frequency: string;
}

interface PreviewContribution {
  group_id: string;
  amount_due: string | number;
  due_date: string;
  payment_status: string;
}

function formatPreviewCurrency(amount: string | number, currency: string) {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  const symbol = currency === 'NGN' ? '₦' : currency === 'GBP' ? '£' : '';
  if (!Number.isFinite(value)) return `${symbol}0`;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatPreviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function DashboardPreview({ name, trust, token }: { name: string; trust: number; token: string }) {
  // Default to neutral greeting for SSR/first render — avoids hydration mismatch
  // when server clock and visitor's local time disagree on morning/afternoon/evening.
  const [greeting, setGreeting] = useState('Welcome back');
  const [loading, setLoading] = useState(true);
  const [trustScore, setTrustScore] = useState(trust);
  const [groups, setGroups] = useState<PreviewGroup[]>([]);
  const [dueContribution, setDueContribution] = useState<PreviewContribution | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let active = true;
    const headers = { Authorization: 'Bearer ' + token };

    void Promise.all([
      window.fetch('/api/users/stats', { headers }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      window.fetch('/api/groups', { headers }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      window.fetch('/api/contributions', { headers }).then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([statsJson, groupsJson, contribJson]) => {
      if (!active) return;
      if (typeof statsJson?.data?.trust_score === 'number') setTrustScore(statsJson.data.trust_score);

      const nextGroups: PreviewGroup[] = Array.isArray(groupsJson?.data) ? groupsJson.data : [];
      setGroups(nextGroups);

      const contributions: PreviewContribution[] = Array.isArray(contribJson?.data) ? contribJson.data : [];
      const due = contributions
        .filter(c => c.payment_status === 'due' || c.payment_status === 'overdue')
        .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
      setDueContribution(due ?? null);
    }).finally(() => {
      if (active) setLoading(false);
    });

    return () => { active = false; };
  }, [token]);

  const firstGroup = groups[0];
  const dueGroup = dueContribution ? groups.find(g => g.id === dueContribution.group_id) : undefined;

  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="absolute inset-0 rounded-3xl blur-3xl opacity-30" style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)' }} />
      <div className="relative rounded-3xl p-6 border border-white/20 shadow-2xl"
        style={{ background: 'linear-gradient(145deg, #1A1A2E, #0D2818)' }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs text-gray-400 font-medium">{greeting},</p>
            <p className="text-white font-bold text-lg">{name} 👋</p>
          </div>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{ background: 'rgba(46,175,111,0.2)', color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.3)' }}>
            <Shield size={12} /> Trust: {trustScore}
          </div>
        </div>
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {[
            { label: 'My Groups',      icon: PiggyBank, color: '#2EAF6F', to: '/savings-groups' },
            { label: 'Dashboard',      icon: TrendingUp, color: '#2eafaf', to: '/dashboard' },
          ].map(a => (
            <Link key={a.label} to={a.to}
              className="flex items-center gap-2 rounded-2xl p-3 text-sm font-semibold text-white transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <a.icon size={15} style={{ color: a.color }} />
              {a.label}
            </Link>
          ))}
        </div>
        {/* Savings group — real data, or a real empty state if the member has none yet */}
        {!loading && !firstGroup ? (
          <Link to="/savings-groups/create" className="flex items-center gap-3 rounded-2xl p-4 mb-3 transition-all hover:opacity-90"
            style={{ background: 'rgba(46,175,111,0.1)', border: '1px dashed rgba(46,175,111,0.3)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(46,175,111,0.2)' }}>
              <Plus size={15} style={{ color: '#2EAF6F' }} />
            </div>
            <div>
              <p className="text-white text-xs font-bold">Create your first savings group</p>
              <p className="text-gray-400 text-xs">You haven't joined or created any groups yet.</p>
            </div>
          </Link>
        ) : firstGroup ? (
          <div className="rounded-2xl p-4 mb-3" style={{ background: 'rgba(46,175,111,0.1)', border: '1px solid rgba(46,175,111,0.2)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-semibold text-sm truncate">{firstGroup.name}</span>
              {groups.length > 1 && (
                <span className="text-xs font-bold flex-shrink-0" style={{ color: '#2EAF6F' }}>+{groups.length - 1} more</span>
              )}
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-gray-400 text-xs">
                {formatPreviewCurrency(firstGroup.contribution_amount, firstGroup.currency)} · {firstGroup.contribution_frequency}
              </span>
            </div>
          </div>
        ) : null}
        {/* Notification — only a real, due contribution reminder, never fabricated */}
        {dueContribution && (
          <div className="flex items-center gap-3 rounded-2xl p-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.2)' }}>
              <Bell size={15} style={{ color: '#F59E0B' }} />
            </div>
            <div>
              <p className="text-white text-xs font-bold">Payment reminder</p>
              <p className="text-gray-400 text-xs">
                {formatPreviewCurrency(dueContribution.amount_due, dueGroup?.currency ?? 'GBP')} due {formatPreviewDate(dueContribution.due_date)}
                {dueGroup?.name ? ` · ${dueGroup.name}` : ''}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hero illustration (logged-out — purely visual, no fake user data) ─────────
function HeroIllustration({ region }: { region: Region }) {
  const features = [
    { icon: Shield,     label: 'Trust Score™',        sub: 'Built on payment history',   color: '#2EAF6F' },
    { icon: Users,      label: 'Savings Groups',       sub: 'Ajo, Esusu & more',          color: '#F59E0B' },
    { icon: CheckCircle,label: 'Secure Payouts',       sub: 'Secure processing',          color: '#2eafaf' },
    { icon: TrendingUp, label: 'Full Transparency',    sub: 'Every contribution tracked', color: '#8B5CF6' },
  ];
  return (
    <div className="relative w-full max-w-md mx-auto">
      <div className="absolute inset-0 rounded-3xl blur-3xl opacity-20" style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)' }} />
      <div className="relative rounded-3xl p-7 border border-white/10 shadow-2xl"
        style={{ background: 'linear-gradient(145deg, rgba(26,26,46,0.95), rgba(13,40,24,0.95))' }}>

        {/* Top label */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.2)' }}>
            <PiggyBank size={16} style={{ color: '#2EAF6F' }} />
          </div>
          <div>
            <p className="text-white text-sm font-bold">How PadiHub works</p>
            <p className="text-gray-400 text-xs">Save smarter, together</p>
          </div>
        </div>

        {/* Feature tiles */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {features.map(f => (
            <div key={f.label} className="rounded-2xl p-4"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${f.color}20` }}>
                <f.icon size={16} style={{ color: f.color }} />
              </div>
              <p className="text-white text-xs font-bold leading-tight mb-0.5">{f.label}</p>
              <p className="text-gray-500 text-xs">{f.sub}</p>
            </div>
          ))}
        </div>

        {/* CTA strip */}
        <div className="rounded-2xl p-4 flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, rgba(46,175,111,0.15), rgba(245,158,11,0.1))', border: '1px solid rgba(46,175,111,0.2)' }}>
          <div style={{ display: 'flex', flexDirection: 'row' }}>
            {['#2EAF6F','#F59E0B','#2eafaf','#8B5CF6','#EF4444'].map((c, i) => (
              <div key={i}
                style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '2px solid rgba(26,26,46,0.9)',
                  background: c,
                  marginLeft: i === 0 ? 0 : -8,
                  flexShrink: 0,
                }} />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold">Create or join your first group</p>
            <p className="text-gray-400 text-xs">{regionCopy[region].illustration}</p>
          </div>
          <ArrowRight size={14} style={{ color: '#2EAF6F' }} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}

type HomeTier = {
  key: 'basic' | 'premium';
  name: string;
  price: string;
  tagline: string;
  color: string;
  recommended?: boolean;
};

// Mirrors the Basic/Premium tier data on /pricing (src/pages/pricing.tsx) so
// the homepage teaser stays in sync with the actual two-tier subscription
// model instead of a stale flat single-price-per-country card.
const homeTiersByRegion: Record<'UK' | 'NG', HomeTier[]> = {
  UK: [
    { key: 'basic', name: 'Basic', price: '£4.99', tagline: 'Join up to 3 groups · Cannot create', color: '#2EAF6F' },
    { key: 'premium', name: 'Premium', price: '£14.99', tagline: 'Create up to 3 groups · Join up to 5 more (8 total)', color: '#F59E0B', recommended: true },
  ],
  NG: [
    { key: 'basic', name: 'Basic', price: '₦5,000', tagline: 'Join up to 3 groups · Cannot create', color: '#2EAF6F' },
    { key: 'premium', name: 'Premium', price: '₦10,000', tagline: 'Create up to 3 groups · Join up to 5 more (8 total)', color: '#F59E0B', recommended: true },
  ],
};

// ── Main Page ────────────────────────────────────────────────────────────────
export default function HomePage() {
  const pricingRegion = usePricingRegion();
  const authUser = useAuthUser();
  const regionalCopy = regionCopy[pricingRegion];
  // The teaser must always show exactly one region's tiers (per location),
  // never both at once — fall back the transient 'BOTH' hook state to 'UK'
  // (matching the UK-first fallback already used on /pricing) until geo
  // resolves client-side.
  const homeTiers = homeTiersByRegion[pricingRegion === 'NG' ? 'NG' : 'UK'];
  return (
    <>
      <Helmet>
        <title>PadiHub — Save Together. Grow Together. Belong.</title>
        <meta name="description" content="PadiHub is a Community Operating System for savings. Build trust, join savings groups and reach your goals together." />
        <link rel="canonical" href="https://padihub.com/" />
        <meta property="og:title" content="PadiHub — Save Together. Grow Together. Belong." />
        <meta property="og:description" content="PadiHub helps savings groups track contributions, manage rotations, and build trust together." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://padihub.com/" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        {/* JSON-LD inside Helmet so the SSR collector places it in <head>.
            A bare <script dangerouslySetInnerHTML> in the page body is treated
            by React 19 as a hoistable resource — it moves to <head> on the
            client but stays inline on the server, causing hydration error #418. */}
        <script type="application/ld+json">{_jsonLd}</script>
      </Helmet>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', background: 'linear-gradient(135deg, #0F172A 0%, #1A1A2E 40%, #0D2818 100%)', overflow: 'hidden' }}>

        {/* Decorative blobs */}
        <div style={{ position: 'absolute', top: 80, left: 40, width: 160, height: 160, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.2, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 80, right: 40, width: 192, height: 192, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#F59E0B', pointerEvents: 'none' }} />

        <style>{`
          @media (min-width: 1024px) {
            .hero-inner { flex-direction: row !important; align-items: center !important; }
            .hero-left  { width: 52% !important; }
            .hero-right { display: flex !important; width: 48% !important; padding-left: 3rem; }
            .hero-cta   { flex-direction: row !important; }
            .hero-cta > * { width: auto !important; }
          }
        `}</style>

        <div style={{ position: 'relative', width: '100%', maxWidth: '80rem', margin: '0 auto', padding: '4rem 1.25rem', boxSizing: 'border-box' }}>
          <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>
            PadiHub — Save Together. Grow Together. Belong.
          </h1>

          {/* Two-column flex — stacks on mobile, side-by-side on lg */}
          <div className="hero-inner" style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', width: '100%', boxSizing: 'border-box' }}>

            {/* Left column */}
            <div className="hero-left" style={{ width: '100%', boxSizing: 'border-box', minWidth: 0 }}>

              {/* Badge */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, fontSize: 12, fontWeight: 700, marginBottom: 24, background: 'rgba(46,175,111,0.15)', color: '#2EAF6F', border: '1px solid rgba(46,175,111,0.3)' }}>
                <Sparkles size={12} /> Communal Savings System
              </div>

              {/* Heading */}
              <div style={{ fontSize: 'clamp(1.75rem, 6vw, 3.75rem)', fontWeight: 800, lineHeight: 1.15, marginBottom: 24, fontFamily: 'Nunito, sans-serif', color: '#FFFFFF', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                Save Together.{' '}
                <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  Grow Together.
                </span>{' '}
                Belong.
              </div>

              {/* Subheading */}
              <div style={{ fontSize: 'clamp(0.9rem, 2.5vw, 1.1rem)', color: '#D1D5DB', lineHeight: 1.7, marginBottom: 32, wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                <p style={{ margin: 0 }}>
                  PadiHub is a digital platform for rotating savings groups — Ajo, Esusu, contribution groups, and other community savings circles. Set clear rules, track every contribution, and keep payouts transparent from the first collection to the next turn.
                </p>
                <p style={{ color: '#FFFFFF', margin: '12px 0 0', fontWeight: 600 }}>{regionalCopy.hero}</p>
              </div>

              {/* Value proposition */}
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 900, fontFamily: 'Nunito, sans-serif', background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', lineHeight: 1.15 }}>
                  Clear rules. Visible contributions.
                </div>
                <div style={{ color: '#9CA3AF', fontSize: 14, marginTop: 8, lineHeight: 1.6 }}>Bring your group together with transparent records, structured rotations, and a shared view of what happens next.</div>
              </div>

              {/* CTA buttons */}
              <div className="hero-cta" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
                <Button asChild size="lg" style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 0 30px rgba(46,175,111,0.5)', borderRadius: 999, fontWeight: 700, width: '100%' }}>
                  <Link to="/get-started" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    Get started <ArrowRight size={18} />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" style={{ borderRadius: 999, fontWeight: 700, width: '100%', borderColor: 'rgba(255,255,255,0.2)', color: '#fff', background: 'transparent' }}>
                  <Link to="/how-it-works" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Play size={16} /> Learn more
                  </Link>
                </Button>
              </div>

              {/* Trust message */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, maxWidth: '32rem' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(46,175,111,0.16)', border: '1px solid rgba(46,175,111,0.25)' }}>
                  <Shield size={16} style={{ color: '#2EAF6F' }} />
                </div>
                <div>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Built for transparent rotating savings</div>
                  <div style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.6 }}>Keep contributions visible, follow the rotation, and build trust with every on-time payment.</div>
                </div>
              </div>
            </div>

            {/* Right column — exactly ONE `.hero-right` element is ever rendered.
                Previously both the DashboardPreview container and the decorative
                HeroIllustration container shared the `.hero-right` class *and*
                were both always mounted (one just visually empty), so at
                desktop widths the `.hero-right { display: flex !important; }`
                media-query rule forced BOTH on-screen simultaneously whenever a
                visitor was logged out — hero-left (52%) plus two 48%-wide
                hero-right boxes squeezed into one row, crushing the heading
                text down to a sliver and wrapping it word-by-word/letter-by-
                letter. Rendering a single element side-steps that entirely.
                The logged-in member's DashboardPreview is real, functional
                content (their groups, trust score, due contributions), so it
                must always render — including on mobile and tablet — while the
                decorative illustration stays desktop-only (hidden on mobile via
                display:none, shown via the .hero-right media query above). */}
            {authUser.isMounted && authUser.isLoggedIn ? (
              <div
                className="hero-right"
                style={{ display: 'flex', flexShrink: 0, boxSizing: 'border-box', minWidth: 0, width: '100%' }}
              >
                <DashboardPreview name={authUser.name} trust={authUser.trust} token={authUser.token} />
              </div>
            ) : (
              // Gate on isMounted so the first client render matches the SSR
              // output (both render this decorative, desktop-only-visible
              // branch, since isLoggedIn starts false). After hydration,
              // isMounted flips true and we swap to DashboardPreview if the
              // user is logged in. Without this gate, React 19 detects a
              // server/client DOM mismatch and throws hydration error #418.
              <div className="hero-right" style={{ display: 'none', flexShrink: 0, boxSizing: 'border-box', minWidth: 0 }}>
                <HeroIllustration region={pricingRegion} />
              </div>
            )}
          </div>
        </div>

        {/* Trust bar */}
        <div style={{ width: '100%', borderTop: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)' }}>
          <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '1rem 1.25rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '1rem 2rem' }}>
            {[
              { icon: Shield,      label: 'Trust Score™ System' },
              { icon: Users,       label: 'Rotating Savings Groups' },
              { icon: Globe,       label: regionalCopy.trustBar },
              { icon: Zap,         label: 'Instant Contributions' },
              { icon: CheckCircle, label: 'Secure Payouts' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9CA3AF', fontSize: 13, whiteSpace: 'nowrap' }}>
                <Icon size={14} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <style>{`
          @media (min-width: 768px) {
            .hiw-grid { grid-template-columns: repeat(3, 1fr) !important; }
          }
        `}</style>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2EAF6F', marginBottom: 12 }}>How PadiHub works</p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Simple steps to saving together</h2>
            <p style={{ color: '#6B7280', fontSize: 16, maxWidth: 560, margin: '0 auto' }}>Register, complete verification, join or create within your plan limits, contribute on schedule, and receive your payout when it is your turn.</p>
          </div>

          <div className="hiw-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            {[
              { step: '01', icon: Users,       title: 'Create or Join a Group', desc: 'Premium members can create groups, while all members can join within plan limits. New groups only start once at least 3 verified members are ready.', color: '#2EAF6F' },
              { step: '02', icon: TrendingUp,  title: 'Contribute on Schedule', desc: 'Pay each cycle with the clearly itemised processing-fee surcharge shown before you confirm. If a charge fails, there is a fixed 72-hour grace period and one automatic retry.', color: '#F59E0B' },
              { step: '03', icon: CheckCircle, title: 'Receive Your Payout',    desc: 'When it is your turn, the cycle pot is transferred to your payout account. First payouts to a new recipient may take around 7–14 days; later payouts typically complete within about 3 business days.', color: '#2eafaf' },
            ].map((s, i) => (
              <div key={i} style={{ borderRadius: 24, padding: '2rem', textAlign: 'center', background: '#F9FAFB', border: '1px solid #E5E7EB', boxSizing: 'border-box' }}>
                <div style={{ width: 56, height: 56, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', background: `${s.color}20`, flexShrink: 0 }}>
                  <s.icon size={24} style={{ color: s.color }} />
                </div>
                <div style={{ fontSize: 48, fontWeight: 900, color: s.color, fontFamily: 'Nunito, sans-serif', opacity: 0.12, lineHeight: 1, marginBottom: 12 }}>{s.step}</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 12, fontFamily: 'Nunito, sans-serif' }}>{s.title}</h3>
                <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <Button asChild size="lg" style={{ borderRadius: 999, padding: '0 2rem', fontWeight: 700, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
              <Link to="/how-it-works" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>See the full guide <ArrowRight size={16} /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: '#F0FDF4' }}>
        <style>{`
          @media (min-width: 768px) {
            .feat-grid { grid-template-columns: repeat(3, 1fr) !important; }
            .feat-wide  { grid-column: span 2 !important; }
          }
        `}</style>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2EAF6F', marginBottom: 12 }}>Everything you need</p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>Built for groups. Designed for trust.</h2>
          </div>

          <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>

            {/* Trust Score — wide card */}
            <div className="feat-wide" style={{ borderRadius: 24, padding: '2rem', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)', boxSizing: 'border-box' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.2, background: '#2EAF6F', pointerEvents: 'none' }} />
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,175,111,0.2)', flexShrink: 0 }}>
                    <Shield size={22} style={{ color: '#2EAF6F' }} />
                  </div>
                  <div>
                    <h3 style={{ color: '#fff', fontWeight: 700, fontSize: 18, fontFamily: 'Nunito, sans-serif' }}>Trust Score™</h3>
                    <p style={{ color: '#9CA3AF', fontSize: 13 }}>Your savings reputation</p>
                  </div>
                </div>
                <p style={{ color: '#D1D5DB', lineHeight: 1.6, marginBottom: 24, fontSize: 14 }}>
                  Every on-time contribution builds your Trust Score™. Members with higher scores are more likely to be accepted into new groups — your reliability travels with you.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['Built on payment history', 'Visible to group leaders', 'Reputation that moves with you'].map(item => (
                    <span key={item} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: '#D1D5DB', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Savings Groups */}
            <div style={{ borderRadius: 24, padding: '2rem', background: 'linear-gradient(135deg, rgba(46,175,111,0.12), rgba(46,175,111,0.06))', border: '1px solid rgba(46,175,111,0.2)', boxSizing: 'border-box' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,175,111,0.15)', marginBottom: 16, flexShrink: 0 }}>
                <Users size={22} style={{ color: '#2EAF6F' }} />
              </div>
              <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 18, marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>Savings Groups</h3>
              <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
                Premium members can create rotating savings groups, while all members can join within plan limits. Track every payment in real time as your group moves from draft to active.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {['Set contribution amounts together', 'Groups only activate once at least 3 verified members are ready', 'See the full payment and payout history in one place'].map(item => (
                  <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#4B5563' }}>
                    <CheckCircle size={15} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 1 }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Secure Payments */}
            <div style={{ borderRadius: 24, padding: '2rem', background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))', border: '1px solid rgba(245,158,11,0.2)', boxSizing: 'border-box' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245,158,11,0.15)', marginBottom: 16, flexShrink: 0 }}>
                <Zap size={22} style={{ color: '#F59E0B' }} />
              </div>
              <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 18, marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>Secure Payments</h3>
              <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>
                Members save payment details, complete verification, and then use secure region-appropriate payment flows for contributions and payouts.
              </p>
            </div>

            {/* Rotation Tracking */}
            <div style={{ borderRadius: 24, padding: '2rem', background: 'linear-gradient(135deg, rgba(46,175,175,0.12), rgba(46,175,175,0.06))', border: '1px solid rgba(46,175,175,0.2)', boxSizing: 'border-box' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,175,175,0.15)', marginBottom: 16, flexShrink: 0 }}>
                <TrendingUp size={22} style={{ color: '#2eafaf' }} />
              </div>
              <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 18, marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>Rotation Tracking</h3>
              <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>
                Always know whose turn it is. View the full rotation schedule, upcoming payouts, and completed cycles at a glance.
              </p>
            </div>

            {/* Payment Reminders */}
            <div style={{ borderRadius: 24, padding: '2rem', background: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.06))', border: '1px solid rgba(139,92,246,0.2)', boxSizing: 'border-box' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)', marginBottom: 16, flexShrink: 0 }}>
                <Star size={22} style={{ color: '#8B5CF6' }} />
              </div>
              <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 18, marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>Payment Reminders</h3>
              <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>
                Never miss a contribution. Receive timely reminders before each payment is due and stay on top of your group commitments.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FIND A SAVINGS GROUP ─────────────────────────────────────────── */}
      <section id="find-groups" style={{ padding: '5rem 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '60rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2EAF6F', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Find your circle</p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif', marginBottom: 12 }}>Search for a savings group</h2>
            <p style={{ color: '#6B7280', fontSize: 15, maxWidth: 560, margin: '0 auto' }}>
              Browse rotating savings groups open to new members in your location and request to join.
            </p>
          </div>
          <GroupSearch />
        </div>
      </section>

      {/* ── FOUR PILLARS ─────────────────────────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <style>{`
          @media (min-width: 640px)  { .pillars-grid { grid-template-columns: repeat(2, 1fr) !important; } }
          @media (min-width: 1024px) { .pillars-grid { grid-template-columns: repeat(4, 1fr) !important; } }
        `}</style>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2EAF6F', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Our four pillars</p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>Trust · Transparency · Community · Progress</h2>
          </div>

          <div className="pillars-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
            {[
              { icon: Shield,      title: 'Trust',        desc: 'Every member earns their reputation. Trust Score™ is transparent, fair and always growing with each payment.', color: '#2EAF6F' },
              { icon: CheckCircle, title: 'Transparency', desc: 'Full visibility into contributions, rotation order and group activity. No surprises, no hidden fees.', color: '#2eafaf' },
              { icon: Heart,       title: 'Community',    desc: 'You are never alone. Every goal is shared, every milestone celebrated together as a group.', color: '#EF4444' },
              { icon: TrendingUp,  title: 'Progress',     desc: 'Every contribution moves you forward. Track your savings journey and build a record of reliable participation.', color: '#F59E0B' },
            ].map((pill, i) => (
              <div key={i} style={{ borderRadius: 24, padding: '1.75rem', textAlign: 'center', background: '#F9FAFB', border: '1px solid #E5E7EB', boxSizing: 'border-box' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', background: `${pill.color}15`, flexShrink: 0 }}>
                  <pill.icon size={24} style={{ color: pill.color }} />
                </div>
                <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 17, marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>{pill.title}</h3>
                <p style={{ color: '#6B7280', fontSize: 13, lineHeight: 1.6 }}>{pill.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ───────────────────────────────────────────────── */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <style>{`
          @media (min-width: 640px) {
            .home-pricing-grid { grid-template-columns: repeat(2, 1fr) !important; }
          }
        `}</style>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#2EAF6F', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Simple pricing</p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', marginBottom: 12, fontFamily: 'Nunito, sans-serif' }}>Join the community today</h2>
            <p style={{ color: '#6B7280', fontSize: 16 }}>{regionalCopy.pricing}</p>
          </div>

          <div className="home-pricing-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '2rem', maxWidth: '48rem', margin: '0 auto' }}>
            {homeTiers.map(plan => (
              <div key={plan.key} style={{ borderRadius: 24, padding: '2rem', position: 'relative', overflow: 'hidden', border: `2px solid ${plan.color}40`, background: `${plan.color}08`, boxSizing: 'border-box' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 128, height: 128, borderRadius: '50%', filter: 'blur(40px)', opacity: 0.1, background: plan.color, pointerEvents: 'none' }} />
                {plan.recommended && (
                  <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: plan.color, marginBottom: 8 }}>Most popular</p>
                )}
                <p style={{ fontSize: 16, fontWeight: 700, color: '#374151', marginBottom: 16 }}>{plan.name}</p>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 44, fontWeight: 900, color: plan.color, fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>{plan.price}</span>
                  <span style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 4 }}>/month</span>
                </div>
                <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 24 }}>{plan.tagline}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {['Trust Score™ System', 'Secure payment processing', 'Rotation Tracking', 'Payment Reminders'].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#374151' }}>
                      <CheckCircle size={15} style={{ color: plan.color, flexShrink: 0 }} /> {f}
                    </li>
                  ))}
                </ul>
                <Button asChild style={{ width: '100%', borderRadius: 999, fontWeight: 700, background: plan.color, color: '#fff' }}>
                  <Link to="/get-started">Get started</Link>
                </Button>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 13, maxWidth: '44rem', margin: '20px auto 0' }}>
            Basic lets you join up to 3 groups; Premium lets you create up to 3 groups and join up to 5 more (8 total). No annual plan or free trial.
          </p>
          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 13, maxWidth: '48rem', margin: '8px auto 0' }}>
            Subscriptions only charge after verification succeeds, and contribution-processing fees are itemised on top of each contribution — never deducted from the pot.
          </p>
          <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, marginTop: 24 }}>
            <Link to="/pricing" style={{ color: '#2EAF6F', fontWeight: 700, textDecoration: 'none' }}>See full pricing details →</Link>
          </p>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────────────────── */}
      <section style={{ padding: '5rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A 0%, #0D2818 50%, #1A1A2E 100%)' }}>
        <div style={{ position: 'absolute', top: 40, left: 80, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.2, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 40, right: 80, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#F59E0B', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: '56rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 24 }}>🚀</div>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: 'Nunito, sans-serif', lineHeight: 1.2 }}>
            Your group is{' '}
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              waiting for you.
            </span>
          </h2>
          <p style={{ color: '#D1D5DB', fontSize: 'clamp(0.95rem, 2vw, 1.125rem)', marginBottom: 40, lineHeight: 1.7 }}>
            Join PadiHub today. Register, join a savings group, or choose Premium to create one and start building your financial future together.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            <Button asChild size="lg" style={{ borderRadius: 999, padding: '0 2.5rem', fontWeight: 700, fontSize: 16, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 0 40px rgba(46,175,111,0.5)' }}>
              <Link to="/get-started" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Get started <ArrowRight size={20} /></Link>
            </Button>
            <Button asChild variant="outline" size="lg" style={{ borderRadius: 999, padding: '0 2.5rem', fontWeight: 700, fontSize: 16, borderColor: 'rgba(255,255,255,0.2)', color: '#fff', background: 'transparent' }}>
              <Link to="/how-it-works" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Learn more <ChevronRight size={20} /></Link>
            </Button>
          </div>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 24 }}>{regionalCopy.finalCta}</p>
        </div>
      </section>
    </>
  );
}
