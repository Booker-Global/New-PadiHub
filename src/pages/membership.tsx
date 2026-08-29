import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import {
  Shield, Globe, Users, TrendingUp, Zap, Bell, BarChart2,
  ArrowRight, Star, Heart
} from 'lucide-react';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/membership#webpage\",\"name\":\"Become a PadiHub Member — Join Trusted Communities\",\"url\":\"https://padihub.com/membership\",\"description\":\"Join PadiHub and access trusted communities, build your reputation with Trust Score™ and participate in transparent savings ecosystems.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";


const benefits = [
  { icon: Users,     title: 'Access Communities',    desc: 'Join unlimited trusted savings communities across the UK and Nigeria.',       color: '#2EAF6F' },
  { icon: Globe,     title: 'Community Marketplace', desc: 'Discover and join verified communities matched to your goals.',               color: '#2eafaf' },
  { icon: TrendingUp,title: 'Savings Groups',        desc: 'Create and participate in structured savings groups with full transparency.',  color: '#8B5CF6' },
  { icon: Shield,    title: 'Trust Score™',          desc: 'Build a portable reputation that grows with every positive action.',          color: '#2EAF6F' },
  { icon: Globe,     title: 'PadiHub Passport™',     desc: 'Your portable digital community identity — share it anywhere.',              color: '#2eafaf' },
  { icon: Zap,       title: 'Community DNA™',        desc: 'Deep insights into your community\'s health, values and participation.',      color: '#EF4444' },
  { icon: BarChart2, title: 'Analytics',             desc: 'Track your progress, contributions and community impact over time.',          color: '#8B5CF6' },
  { icon: Users,     title: 'Governance',            desc: 'Participate in democratic community decisions and elections.',                color: '#2EAF6F' },
  { icon: Bell,      title: 'Notifications',         desc: 'Stay informed with smart alerts for contributions, votes and events.',        color: '#F59E0B' },
  { icon: Star,      title: 'AI Onboarding',         desc: 'Personalised guidance to help you find the right communities fast.',         color: '#2eafaf' },
  { icon: Heart,     title: 'Priority Support',      desc: 'Get help from our community team whenever you need it.',                     color: '#EF4444' },
];

const stats = [
  { value: '1,200+', label: 'Verified communities', color: '#2EAF6F' },
  { value: '18,000+', label: 'Active members',      color: '#F59E0B' },
  { value: '96%',    label: 'Contribution success', color: '#2eafaf' },
  { value: '4.9★',   label: 'Member satisfaction',  color: '#8B5CF6' },
];

const testimonials = [
  {
    name: 'Amara Okonkwo',
    community: 'Lagos Savers Circle',
    quote: 'PadiHub transformed how our community saves together. The Trust Score™ keeps everyone accountable and the transparency is incredible.',
    tier: 'Trusted Member',
    initial: 'A',
    color: '#2EAF6F',
  },
  {
    name: 'James Thornton',
    community: 'UK Homeowners Hub',
    quote: 'I\'ve tried other platforms but nothing comes close to PadiHub. The Passport™ feature alone is worth the membership.',
    tier: 'Community Champion',
    initial: 'J',
    color: '#2eafaf',
  },
  {
    name: 'Fatima Hassan',
    community: 'Diaspora Builders',
    quote: 'Being able to connect with my community back home while building trust here in the UK is exactly what I needed.',
    tier: 'Verified Member',
    initial: 'F',
    color: '#F59E0B',
  },
];

export default function MembershipPage() {
  return (
    <>
      <Helmet>
        <title>Become a PadiHub Member — Join Trusted Communities</title>
        <meta name="description" content="Join PadiHub and access trusted communities, build your reputation with Trust Score™ and participate in transparent savings ecosystems." />
        <link rel="canonical" href="https://padihub.com/membership" />
        <meta property="og:title" content="Become a PadiHub Member" />
        <meta property="og:description" content="Join trusted communities, build your reputation and participate in transparent savings ecosystems." />
        <meta property="og:type" content="website" />
              <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '7rem 0', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 384, height: 384, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 320, height: 320, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.1, background: '#F59E0B', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 999, marginBottom: 24, fontSize: 13, fontWeight: 700, background: 'rgba(46,175,111,0.15)', border: '1px solid rgba(46,175,111,0.25)', color: '#2EAF6F' }}>
            <Shield size={14} /> Trusted by 18,000+ members
          </div>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>Become a PadiHub Member</h1>
          <h2 style={{ fontSize: 'clamp(1.75rem, 6vw, 3.5rem)', fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: 'Nunito, sans-serif', lineHeight: 1.15 }}>
            Become a{' '}
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              PadiHub Member
            </span>
          </h2>
          <p style={{ color: '#D1D5DB', fontSize: 18, lineHeight: 1.7, maxWidth: '40rem', margin: '0 auto 40px' }}>
            Join trusted communities, build your reputation and participate in transparent savings ecosystems. You are joining something valuable.
          </p>
          <div className="r-flex-center">
            <Link to="/pricing" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 24px rgba(46,175,111,0.4)' }}>
              View membership plans <ArrowRight size={18} />
            </Link>
            <Link to="/savings-groups" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
              Browse communities
            </Link>
          </div>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 24 }}>30-day free trial · No card required · Cancel anytime</p>
        </div>
      </section>

      {/* Stats */}
      <section style={{ padding: '3.5rem 0', background: '#fff', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div className="r-grid-stats">
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 'clamp(1.75rem, 4vw, 2.5rem)', fontWeight: 800, color: s.color, fontFamily: 'Nunito, sans-serif', marginBottom: 4 }}>{s.value}</p>
                <p style={{ fontSize: 13, color: '#6B7280' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section style={{ padding: '5rem 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Everything included</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#111827', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Membership benefits</h2>
            <p style={{ color: '#6B7280', maxWidth: '36rem', margin: '0 auto' }}>One membership. Everything you need to save, grow and thrive in trusted communities.</p>
          </div>
          <div className="r-grid-3">
            {benefits.map((b, i) => (
              <div key={i} style={{ borderRadius: 24, padding: 24, background: '#fff', border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${b.color}12`, marginBottom: 16, flexShrink: 0 }}>
                  <b.icon size={22} style={{ color: b.color }} />
                </div>
                <h3 style={{ fontWeight: 800, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>{b.title}</h3>
                <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Member voices</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>Trusted by real communities</h2>
          </div>
          <div className="r-grid-3">
            {testimonials.map((t, i) => (
              <div key={i} style={{ borderRadius: 24, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, color: '#fff', flexShrink: 0, background: `linear-gradient(135deg, ${t.color}, ${t.color}99)` }}>
                    {t.initial}
                  </div>
                  <div>
                    <p style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>{t.name}</p>
                    <p style={{ fontSize: 12, color: '#9CA3AF' }}>{t.community}</p>
                  </div>
                </div>
                <p style={{ fontSize: 14, color: '#4B5563', lineHeight: 1.7, fontStyle: 'italic', flex: 1 }}>"{t.quote}"</p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>🛡 {t.tier}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Four pillars */}
      <section style={{ padding: '3rem 0', background: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
            {[
              { label: 'Trust',        color: '#2EAF6F', icon: Shield },
              { label: 'Transparency', color: '#2eafaf', icon: Globe },
              { label: 'Community',    color: '#8B5CF6', icon: Users },
              { label: 'Progress',     color: '#F59E0B', icon: TrendingUp },
            ].map(pill => (
              <div key={pill.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 999, background: `${pill.color}10`, border: `1px solid ${pill.color}25` }}>
                <pill.icon size={15} style={{ color: pill.color }} />
                <span style={{ fontWeight: 700, color: '#1F2937', fontSize: 14 }}>{pill.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '5rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Ready to join?</h2>
          <p style={{ color: '#D1D5DB', fontSize: 17, marginBottom: 32 }}>Start your 30-day free trial today. No card required.</p>
          <div className="r-flex-center">
            <Link to="/pricing" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.4)' }}>
              See membership plans <ArrowRight size={18} />
            </Link>
            <Link to="/get-started" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
              Start free trial
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
