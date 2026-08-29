import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { Shield, Users, TrendingUp, Heart, ArrowRight, Globe, Zap, CheckCircle } from 'lucide-react';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/about#webpage\",\"name\":\"About PadiHub — Our Mission & Story\",\"url\":\"https://padihub.com/about\",\"description\":\"PadiHub was built to make community savings accessible, transparent and rewarding for everyone. Learn about our mission, values and the team behind it.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";


const stats = [
  { value: 'Transparent groups', label: 'Track contributions, payouts and shared records in one place.', color: '#2EAF6F' },
  { value: 'Portable trust', label: 'Trust Score helps members carry their reputation between groups.', color: '#F59E0B' },
  { value: 'Shared governance', label: 'Set rules together and keep decisions visible to the full group.', color: '#2eafaf' },
  { value: 'Structured rotations', label: 'Keep every member aligned on the saving order and next steps.', color: '#8B5CF6' },
];

const values = [
  {
    icon: Shield,
    title: 'Trust First',
    desc: 'Every feature we build starts with the question: does this make our communities more trustworthy? Trust Score™ is not just a metric — it\'s our founding principle.',
    color: '#2EAF6F',
  },
  {
    icon: Globe,
    title: 'Radical Transparency',
    desc: 'Communities thrive when everyone can see what\'s happening. Our governance tools, contribution tracking and Community DNA™ make transparency the default.',
    color: '#2eafaf',
  },
  {
    icon: Users,
    title: 'Community First',
    desc: 'We are not a bank. We are not a fintech. We are a community infrastructure platform. Every decision we make puts community wellbeing above everything else.',
    color: '#8B5CF6',
  },
  {
    icon: TrendingUp,
    title: 'Progress for Everyone',
    desc: 'Whether you\'re saving for a home in Lagos or building a diaspora network in London, PadiHub is designed to help every community member grow.',
    color: '#F59E0B',
  },
  {
    icon: Heart,
    title: 'Belonging Matters',
    desc: 'Loneliness is a global crisis. PadiHub creates genuine belonging — communities where people know each other, trust each other and grow together.',
    color: '#EF4444',
  },
];

const team = [
  { name: 'Adaeze Okonkwo',  role: 'Co-Founder & CEO',        location: 'Lagos & London', initial: 'A', color: '#2EAF6F' },
  { name: 'James Thornton',  role: 'Co-Founder & CTO',        location: 'London',         initial: 'J', color: '#2eafaf' },
  { name: 'Fatima Al-Hassan', role: 'Head of Community',      location: 'Lagos',          initial: 'F', color: '#F59E0B' },
  { name: 'Kwame Asante',    role: 'Head of Product',         location: 'Accra & London', initial: 'K', color: '#8B5CF6' },
  { name: 'Priya Sharma',    role: 'Head of Trust & Safety',  location: 'London',         initial: 'P', color: '#EF4444' },
  { name: 'Emeka Obi',       role: 'Head of Engineering',     location: 'Lagos',          initial: 'E', color: '#2EAF6F' },
];

const milestones = [
  { year: '2022', title: 'The idea', desc: 'PadiHub was conceived after our founders experienced the pain of disorganised community savings first-hand.' },
  { year: '2023', title: 'Listening first', desc: 'We spent time learning how community organisers and members keep savings groups running, and where trust can break down.' },
  { year: '2024', title: 'Designing the platform', desc: 'We shaped the early product around contribution tracking, shared rules, and transparent payouts.' },
  { year: '2025', title: 'Preparing for launch', desc: 'We refined the core experience so groups can start with clear expectations and better visibility.' },
  { year: '2026', title: 'The future', desc: 'PadiHub Passport™ and Community DNA™ continue to guide how we build trusted community infrastructure.' },
];

export default function AboutPage() {
  return (
    <>
      <Helmet>
        <title>About PadiHub — Our Mission & Story</title>
        <meta name="description" content="PadiHub was built to make community savings accessible, transparent and rewarding for everyone. Learn about our mission, values and the team behind it." />
        <link rel="canonical" href="https://padihub.com/about" />
        <meta property="og:title" content="About PadiHub — Our Mission & Story" />
        <meta property="og:description" content="Learn about PadiHub's mission to make community savings accessible, transparent and rewarding for everyone." />
        <meta property="og:type" content="website" />
              <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '7rem 0', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 40, left: 40, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.2, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 40, width: 320, height: 320, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.1, background: '#F59E0B', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>Our Story</p>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>About PadiHub — Our Mission and Story</h1>
          <h2 style={{ fontSize: 'clamp(1.75rem, 6vw, 3.5rem)', fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: 'Nunito, sans-serif', lineHeight: 1.15 }}>
            Built for community.<br />
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Designed for trust.
            </span>
          </h2>
          <p style={{ color: '#D1D5DB', fontSize: 18, lineHeight: 1.7, maxWidth: '40rem', margin: '0 auto 40px' }}>
            PadiHub was born from a simple belief: when people save together with trust and transparency, everyone wins.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            <Link to="/get-started" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.4)' }}>
              Join PadiHub
            </Link>
            <Link to="/how-it-works" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ padding: '3rem 0', background: '#fff', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div className="r-grid-stats">
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: s.color, fontFamily: 'Nunito, sans-serif', marginBottom: 4 }}>{s.value}</p>
                <p style={{ fontSize: 13, color: '#6B7280' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div className="r-grid-2" style={{ alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Our Mission</p>
              <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', marginBottom: 24, fontFamily: 'Nunito, sans-serif' }}>
                Making community savings accessible to everyone
              </h2>
              <p style={{ color: '#4B5563', lineHeight: 1.7, marginBottom: 16 }}>
                Community savings traditions — including ajo, esusu, susu, tontines, and rotating savings groups — help people save together through shared discipline and trust. These traditions are powerful, but they often lack the tools to operate transparently at scale.
              </p>
              <p style={{ color: '#4B5563', lineHeight: 1.7, marginBottom: 24 }}>
                PadiHub provides the digital infrastructure that makes these communities more organised, more trustworthy, and more rewarding for every member. We are not replacing tradition — we are empowering it.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Transparent contribution tracking for every member',
                  'Democratic governance tools for community decisions',
                  'Portable reputation that grows with every positive action',
                  'Recognition and achievement for community participation',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <CheckCircle size={16} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                    <span style={{ fontSize: 14, color: '#374151' }}>{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="r-grid-2">
              {[
                { icon: Shield, label: 'Trust Score™',    desc: 'Reputation that travels with you',     color: '#2EAF6F' },
                { icon: Globe,  label: 'Passport™',       desc: 'Your portable community identity',     color: '#2eafaf' },
                { icon: Zap,    label: 'Governance',      desc: 'Democratic community decisions',       color: '#8B5CF6' },
              ].map((f, i) => (
                <div key={i} style={{ borderRadius: 24, padding: 20, background: `${f.color}08`, border: `1px solid ${f.color}20` }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${f.color}15`, marginBottom: 12, flexShrink: 0 }}>
                    <f.icon size={20} style={{ color: f.color }} />
                  </div>
                  <p style={{ fontWeight: 700, color: '#111827', fontSize: 14, marginBottom: 4 }}>{f.label}</p>
                  <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }}>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section style={{ padding: '5rem 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Our Journey</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>From idea to infrastructure</h2>
          </div>
          <div className="about-timeline" style={{ position: 'relative' }}>
            <div className="about-timeline-line" style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: 'linear-gradient(180deg, #2EAF6F, #F59E0B)' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {milestones.map((m, i) => (
                <div key={i} className="about-timeline-item" style={{ display: 'flex', gap: 16, position: 'relative' }}>
                  <div className="about-timeline-dot" style={{ position: 'absolute', top: 4, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff', background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, borderRadius: 24, padding: 20, background: '#fff', border: '1px solid #F3F4F6', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999, background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>{m.year}</span>
                      <h3 style={{ fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif', wordBreak: 'break-word' }}>{m.title}</h3>
                    </div>
                    <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{m.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>What We Believe</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>Our values</h2>
          </div>
          <div className="r-grid-3">
            {values.map((v, i) => (
              <div key={i} style={{ borderRadius: 24, padding: 24, background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${v.color}15`, marginBottom: 16, flexShrink: 0 }}>
                  <v.icon size={22} style={{ color: v.color }} />
                </div>
                <h3 style={{ fontWeight: 800, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>{v.title}</h3>
                <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section style={{ padding: '5rem 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>The People</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.25rem)', fontWeight: 800, color: '#111827', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Meet the team</h2>
            <p style={{ color: '#6B7280', maxWidth: '36rem', margin: '0 auto' }}>A diverse team across the UK and Nigeria, united by a shared belief in the power of community.</p>
          </div>
          <div className="r-grid-3">
            {team.map((member, i) => (
              <div key={i} style={{ borderRadius: 24, padding: 24, background: '#fff', textAlign: 'center', border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#fff', margin: '0 auto 16px', background: `linear-gradient(135deg, ${member.color}, ${member.color}99)`, flexShrink: 0 }}>
                  {member.initial}
                </div>
                <h3 style={{ fontWeight: 800, color: '#111827', marginBottom: 4, fontFamily: 'Nunito, sans-serif' }}>{member.name}</h3>
                <p style={{ fontSize: 13, fontWeight: 600, color: member.color, marginBottom: 4 }}>{member.role}</p>
                <p style={{ fontSize: 12, color: '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Globe size={11} /> {member.location}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Four pillars */}
      <section style={{ padding: '3rem 0', background: '#fff', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 16 }}>
            {[
              { label: 'Trust',         icon: Shield,     color: '#2EAF6F' },
              { label: 'Transparency',  icon: Globe,      color: '#2eafaf' },
              { label: 'Community',     icon: Users,      color: '#8B5CF6' },
              { label: 'Progress',      icon: TrendingUp, color: '#F59E0B' },
            ].map(pill => (
              <div key={pill.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 24px', borderRadius: 999, background: `${pill.color}10`, border: `1px solid ${pill.color}25` }}>
                <pill.icon size={16} style={{ color: pill.color }} />
                <span style={{ fontWeight: 700, color: '#1F2937' }}>{pill.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '5rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Ready to build trust together?</h2>
          <p style={{ color: '#D1D5DB', fontSize: 17, marginBottom: 32 }}>Bring your group together with transparent records, secure payment flows, and tools designed for trust.</p>
          <div className="r-flex-center">
            <Link to="/get-started" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.4)' }}>
              Get started free <ArrowRight size={18} />
            </Link>
            <Link to="/savings-groups" style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
              Browse communities
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
