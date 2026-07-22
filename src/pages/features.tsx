import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { Shield, Award, Globe, Users, Sparkles, Vote, Bell, User, PiggyBank, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/features#webpage\",\"name\":\"Features — PadiHub Community Savings Platform\",\"url\":\"https://padihub.com/features\",\"description\":\"Explore all PadiHub features — Trust Score™, Community Karma™, Passport™, Savings Groups, Community DNA™ and more.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";


const features = [
  { icon: Shield, title: 'Trust Score™', desc: 'A living reputation system with 6 tiers — from Explorer to Community Champion. Every contribution builds your score.', color: '#2EAF6F', tag: 'Identity' },
  { icon: Award, title: 'Community Karma™', desc: '7 levels of recognition. Every positive action earns Karma points, badges and community recognition.', color: '#F59E0B', tag: 'Recognition' },
  { icon: Globe, title: 'PadiHub Passport™', desc: 'Your premium digital identity. Carry your Trust Score™, achievements and community history everywhere.', color: '#2eafaf', tag: 'Identity' },
  { icon: PiggyBank, title: 'Savings Groups', desc: 'Create or join rotating savings groups. Track contributions, celebrate milestones and hold each other accountable.', color: '#8B5CF6', tag: 'Savings' },
  { icon: Sparkles, title: 'Community DNA™', desc: 'Living community intelligence. Understand your community\'s health, participation and growth journey.', color: '#EF4444', tag: 'Insights' },
  { icon: Users, title: 'Community Marketplace', desc: 'Discover and join communities that match your goals. Browse 200+ verified communities with full transparency.', color: '#2EAF6F', tag: 'Discovery' },
  { icon: Vote, title: 'Governance', desc: 'Community-led decision making. Vote on proposals, elect leaders and shape your community\'s future.', color: '#F59E0B', tag: 'Governance' },
  { icon: Bell, title: 'Activity Centre', desc: 'Stay on top of contributions, achievements, governance votes and community activity — all in one place.', color: '#2eafaf', tag: 'Notifications' },
  { icon: User, title: 'Personal Control Centre', desc: 'Full control over your profile, privacy, notifications and subscription — all in a premium settings experience.', color: '#8B5CF6', tag: 'Settings' },
];

export default function FeaturesPage() {
  return (
    <>
      <Helmet>
        <title>Features — PadiHub Community Savings Platform</title>
        <meta name="description" content="Explore all PadiHub features — Trust Score™, Community Karma™, Passport™, Savings Groups, Community DNA™ and more." />
        <link rel="canonical" href="https://padihub.com/features" />
              <meta property="og:title" content="Features — PadiHub Community Savings Platform" />
        <meta property="og:description" content="Explore all PadiHub features — Trust Score™, Community Karma™, Passport™, Savings Groups, Community DNA™ and more." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      {/* Hero */}
      <section style={{ padding: '5rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 40, left: 40, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.2, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>Everything you need</p>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>PadiHub Features — Community Savings Platform</h1>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: 'Nunito, sans-serif', lineHeight: 1.2 }}>
            Built for community.{' '}
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Designed for trust.
            </span>
          </h2>
          <p style={{ color: '#D1D5DB', fontSize: 18, maxWidth: '40rem', margin: '0 auto' }}>
            Every feature on PadiHub is built around one goal: making community savings safe, transparent and deeply rewarding.
          </p>
        </div>
      </section>

      {/* Features grid */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div className="r-grid-3">
            {features.map((f, i) => (
              <div key={i} style={{ borderRadius: 24, padding: 28, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${f.color}15`, flexShrink: 0 }}>
                    <f.icon size={24} style={{ color: f.color }} />
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: `${f.color}10`, color: f.color }}>{f.tag}</span>
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>{f.title}</h3>
                <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '5rem 0', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Experience all features free</h2>
          <p style={{ color: '#D1D5DB', marginBottom: 32 }}>30-day free trial. No credit card required.</p>
          <Button asChild size="lg" style={{ borderRadius: 999, padding: '0 2.5rem', fontWeight: 700, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 0 30px rgba(46,175,111,0.4)' }}>
            <Link to="/get-started" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Start free trial <ArrowRight size={18} /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}
