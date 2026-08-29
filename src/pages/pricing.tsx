import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { CheckCircle, ArrowRight, Shield, Star, Zap } from 'lucide-react';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/pricing#webpage\",\"name\":\"Membership Pricing — PadiHub\",\"url\":\"https://padihub.com/pricing\",\"description\":\"Simple, transparent pricing for PadiHub membership. Join UK or Nigeria communities from £4.99/month or ₦3,500/month. 30-day free trial.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";


const features = [
  'Unlimited Savings Groups',
  'Trust Score™',
  'Secure payment processing',
  'Rotation Tracking',
  'Payment Reminders',
  'Group Management Tools',
  'Notifications',
  'Payment History',
  'Priority Support',
];

const comparisonRows = [
  { feature: 'Savings Groups',              monthly: true,  annual: true  },
  { feature: 'Trust Score™',               monthly: true,  annual: true  },
  { feature: 'Secure Payments',            monthly: true,  annual: true  },
  { feature: 'Rotation Tracking',          monthly: true,  annual: true  },
  { feature: 'Payment Reminders',          monthly: true,  annual: true  },
  { feature: 'Notifications',              monthly: true,  annual: true  },
  { feature: 'Payment History',            monthly: true,  annual: true  },
  { feature: 'Priority Support',           monthly: false, annual: true  },
  { feature: 'Early Access to New Features', monthly: false, annual: true },
];

const plans = {
  UK: [
    { key: 'uk-monthly', name: 'UK Monthly', price: '£4.99', period: '/month', billing: 'Billed monthly', saving: null, recommended: false, annualEquiv: null },
    { key: 'uk-annual',  name: 'UK Annual',  price: '£49.99', period: '/year', billing: 'Billed annually', saving: 'Save £9.89 (17%)', recommended: true, annualEquiv: '£4.17/mo' },
  ],
  NG: [
    { key: 'ng-monthly', name: 'Nigeria Monthly', price: '₦3,500', period: '/month', billing: 'Billed monthly', saving: null, recommended: false, annualEquiv: null },
    { key: 'ng-annual',  name: 'Nigeria Annual',  price: '₦35,000', period: '/year', billing: 'Billed annually', saving: 'Save ₦7,000 (17%)', recommended: true, annualEquiv: '₦2,917/mo' },
  ],
};

export default function PricingPage() {
  const [region, setRegion] = useState<'UK' | 'NG'>('UK');

  return (
    <>
      <Helmet>
        <title>Membership Pricing — PadiHub</title>
        <meta name="description" content="Simple, transparent pricing for PadiHub membership. Join UK or Nigeria communities from £4.99/month or ₦3,500/month. 30-day free trial." />
        <link rel="canonical" href="https://padihub.com/pricing" />
        <meta property="og:title" content="Membership Pricing — PadiHub" />
        <meta property="og:description" content="Simple, transparent pricing for PadiHub membership. 30-day free trial included." />
        <meta property="og:type" content="website" />
              <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      <style>{`
        .pricing-cards { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 48rem; margin: 0 auto; }
        @media (min-width: 640px) { .pricing-cards { grid-template-columns: 1fr 1fr; } }
        .trust-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; text-align: center; }
        @media (min-width: 640px) { .trust-grid { grid-template-columns: 1fr 1fr 1fr; } }
        .cta-btns { display: flex; flex-direction: column; gap: 1rem; justify-content: center; }
        @media (min-width: 640px) { .cta-btns { flex-direction: row; } }
        .pricing-hero { padding: 4rem 0; }
        @media (min-width: 768px) { .pricing-hero { padding: 6rem 0; } }
        @media (max-width: 380px) {
          .pricing-region-toggle button { padding: 10px 12px !important; font-size: 12px !important; }
        }
      `}</style>

      {/* Hero */}
      <section className="pricing-hero" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 384, height: 384, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.1, background: '#F59E0B', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>Simple pricing</p>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>PadiHub Membership Pricing</h1>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif', lineHeight: 1.2 }}>
            One membership.<br />
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Everything included.
            </span>
          </h2>
          <p style={{ color: '#D1D5DB', fontSize: 17, marginBottom: 24, maxWidth: '36rem', margin: '0 auto 24px' }}>
            No hidden fees. No feature tiers. Every member gets the full PadiHub experience.
          </p>
          <p style={{ color: '#6B7280', fontSize: 13 }}>30-day free trial · No card required · Cancel anytime</p>
        </div>
      </section>

      {/* Region toggle */}
      <section style={{ padding: '2.5rem 0', background: '#fff', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '36rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', marginBottom: 16 }}>Select your region</p>
          <div className="pricing-region-toggle" style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', borderRadius: 16, padding: 6, background: '#F3F4F6', maxWidth: '100%' }}>
            {(['UK', 'NG'] as const).map(r => (
              <button key={r} onClick={() => setRegion(r)}
                style={{
                  padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s', flex: '1 1 auto', minWidth: 0,
                  background: region === r ? '#fff' : 'transparent',
                  color: region === r ? '#2EAF6F' : '#6B7280',
                  boxShadow: region === r ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                }}>
                <span className="hidden sm:inline">{r === 'UK' ? '🇬🇧 United Kingdom' : '🇳🇬 Nigeria'}</span>
                <span className="inline sm:hidden">{r === 'UK' ? '🇬🇧 UK' : '🇳🇬 NG'}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing cards */}
      <section style={{ padding: '5rem 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div className="pricing-cards">
            {plans[region].map(plan => (
              <div key={plan.key}
                style={{
                  position: 'relative', borderRadius: 24, padding: 32, display: 'flex', flexDirection: 'column',
                  background: plan.recommended ? 'linear-gradient(135deg, #0F172A, #1A1A2E)' : '#fff',
                  border: plan.recommended ? 'none' : '1px solid #E5E7EB',
                  boxShadow: plan.recommended ? '0 8px 40px rgba(46,175,111,0.25)' : '0 2px 12px rgba(0,0,0,0.04)',
                }}>
                {plan.recommended && (
                  <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)' }}>
                    <span style={{ padding: '6px 20px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 12px rgba(46,175,111,0.4)', whiteSpace: 'nowrap' }}>
                      ⭐ Recommended
                    </span>
                  </div>
                )}
                <div style={{ marginBottom: 24 }}>
                  <p style={{ fontWeight: 700, marginBottom: 4, color: plan.recommended ? 'rgba(255,255,255,0.6)' : '#6B7280', fontSize: 13 }}>{plan.name}</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, marginBottom: 4 }}>
                    <span style={{ fontSize: 40, fontWeight: 800, color: plan.recommended ? '#fff' : '#111827', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>{plan.price}</span>
                    <span style={{ fontSize: 13, marginBottom: 6, color: plan.recommended ? 'rgba(255,255,255,0.5)' : '#9CA3AF' }}>{plan.period}</span>
                  </div>
                  {plan.annualEquiv && <p style={{ fontSize: 13, fontWeight: 600, color: '#2EAF6F' }}>Equivalent to {plan.annualEquiv}</p>}
                  {plan.saving && (
                    <span style={{ display: 'inline-block', marginTop: 8, padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: 'rgba(46,175,111,0.15)', color: '#2EAF6F' }}>
                      {plan.saving}
                    </span>
                  )}
                  <p style={{ fontSize: 12, marginTop: 8, color: plan.recommended ? 'rgba(255,255,255,0.4)' : '#9CA3AF' }}>{plan.billing}</p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32, flex: 1 }}>
                  {features.map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle size={14} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: plan.recommended ? 'rgba(255,255,255,0.8)' : '#374151' }}>{f}</span>
                    </div>
                  ))}
                </div>
                <Link to={`/subscription/confirm?plan=${plan.key}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '14px 0', borderRadius: 16, fontWeight: 700, fontSize: 15, textDecoration: 'none', transition: 'opacity 0.2s',
                    background: plan.recommended ? 'linear-gradient(135deg, #2EAF6F, #1d8a55)' : '#F9FAFB',
                    color: plan.recommended ? '#fff' : '#374151',
                    border: plan.recommended ? 'none' : '1px solid #E5E7EB',
                    boxShadow: plan.recommended ? '0 4px 16px rgba(46,175,111,0.3)' : 'none',
                  }}>
                  Start free trial <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Compare plans</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>Monthly vs Annual</h2>
          </div>
          <div style={{ borderRadius: 24, overflow: 'auto', border: '1px solid #E5E7EB', boxShadow: '0 2px 16px rgba(0,0,0,0.04)', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 320 }}>
              <div className="pricing-compare-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(64px,80px) minmax(64px,80px)', padding: '16px', borderBottom: '1px solid #F3F4F6', background: '#F9FAFB' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6B7280' }}>Feature</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textAlign: 'center' }}>Monthly</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2EAF6F', textAlign: 'center' }}>Annual ⭐</div>
              </div>
              {comparisonRows.map((row, i) => (
                <div key={i} className="pricing-compare-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(64px,80px) minmax(64px,80px)', padding: '14px 16px', borderBottom: i < comparisonRows.length - 1 ? '1px solid #F9FAFB' : 'none' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 0, paddingRight: 8 }}>{row.feature}</div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {row.monthly ? <CheckCircle size={18} style={{ color: '#2EAF6F' }} /> : <span style={{ width: 16, height: 2, borderRadius: 2, background: '#E5E7EB', display: 'block', marginTop: 8 }} />}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    {row.annual ? <CheckCircle size={18} style={{ color: '#2EAF6F' }} /> : <span style={{ width: 16, height: 2, borderRadius: 2, background: '#E5E7EB', display: 'block', marginTop: 8 }} />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section style={{ padding: '4rem 0', background: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div className="trust-grid">
            {[
              { icon: Shield, title: 'Secure & trusted',  desc: 'Your data and community are always protected.',    color: '#2EAF6F' },
              { icon: Star,   title: '4.9★ satisfaction', desc: '18,000+ members trust PadiHub every day.',         color: '#F59E0B' },
              { icon: Zap,    title: 'Cancel anytime',    desc: 'No lock-in. No penalties. Your choice, always.',   color: '#8B5CF6' },
            ].map((t, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${t.color}12`, flexShrink: 0 }}>
                  <t.icon size={22} style={{ color: t.color }} />
                </div>
                <p style={{ fontWeight: 700, color: '#111827' }}>{t.title}</p>
                <p style={{ fontSize: 13, color: '#6B7280' }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '5rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center', position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Start your free trial today</h2>
          <p style={{ color: '#D1D5DB', marginBottom: 32 }}>30 days free. No card required. Cancel anytime.</p>
          <div className="cta-btns">
            <Link to="/get-started"
              style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.4)' }}>
              Get started free <ArrowRight size={18} />
            </Link>
            <Link to="/membership"
              style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}>
              View membership benefits
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
