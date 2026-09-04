import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle, Users } from 'lucide-react';
import { getValidSession } from '@/lib/session';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/pricing#webpage\",\"name\":\"Membership Pricing — PadiHub\",\"url\":\"https://padihub.com/pricing\",\"description\":\"Region-aware monthly pricing for PadiHub's Basic and Premium subscriptions.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

type PricingRegion = 'UK' | 'NG';
type GeoRegion = PricingRegion | 'BOTH';
type PlanKey = 'basic' | 'premium';

type PlanCard = {
  key: PlanKey;
  name: string;
  price: string;
  summary: string;
  createLimitLabel: string;
  joinLimitLabel: string;
  highlights: string[];
  recommended?: boolean;
};

type GeoResponse = {
  region?: GeoRegion;
};

type ProfileResponse = {
  success?: boolean;
  data?: {
    country?: string | null;
  };
};

const commonFeatures = [
  'Trust Score™ for accountable participation',
  'Secure payment processing',
  'Rotation tracking and reminders',
  'Group management tools and notifications',
];

const verificationNotesByRegion: Record<PricingRegion, { title: string; body: string; bullets: string[] }> = {
  UK: {
    title: 'Verification before the first UK charge',
    body: 'Save your card first, then complete Stripe Identity inside an embedded PadiHub dashboard modal. Your profile stays Pending until verification succeeds.',
    bullets: [
      'Your subscription is set up only after identity verification succeeds, and billing starts once you\'re a verified member of an active group with at least 3 members',
      'A verification fee may apply to your first subscription charge — see our Terms & Conditions for details',
      'If verification fails, no charge is taken and you receive a try-again email',
    ],
  },
  NG: {
    title: 'Verification before the first Nigeria charge',
    body: 'Save your bank details first, then complete Flutterwave Account Resolve — a free preliminary bank-account name match, not full KYC. Your profile stays Pending until resolve succeeds.',
    bullets: [
      'Your subscription is set up only after Account Resolve succeeds, and billing starts once you\'re a verified member of an active group with at least 3 members',
      'There is no fee for the Account Resolve check',
      'If the check fails, no charge is taken and you receive a try-again email',
    ],
  },
};

const plansByRegion: Record<PricingRegion, PlanCard[]> = {
  UK: [
    {
      key: 'basic',
      name: 'Basic',
      price: '£4.99',
      summary: 'For members who want to join savings circles without running their own.',
      createLimitLabel: 'Cannot create a savings group',
      joinLimitLabel: 'Join up to 3 groups',
      highlights: ['Ideal for members who just want to contribute and save'],
    },
    {
      key: 'premium',
      name: 'Premium',
      price: '£14.99',
      summary: 'For organisers leading circles and managing a larger savings network.',
      createLimitLabel: 'Create up to 3 savings groups',
      joinLimitLabel: 'Join up to 5 more groups (8 total)',
      highlights: ['Best for organisers and admins'],
      recommended: true,
    },
  ],
  NG: [
    {
      key: 'basic',
      name: 'Basic',
      price: '₦5,000',
      summary: 'For members who want to join savings circles without running their own.',
      createLimitLabel: 'Cannot create a savings group',
      joinLimitLabel: 'Join up to 3 groups',
      highlights: ['Ideal for members who just want to contribute and save'],
    },
    {
      key: 'premium',
      name: 'Premium',
      price: '₦10,000',
      summary: 'For organisers leading circles and managing a larger savings network.',
      createLimitLabel: 'Create up to 3 savings groups',
      joinLimitLabel: 'Join up to 5 more groups (8 total)',
      highlights: ['Best for organisers and admins'],
      recommended: true,
    },
  ],
};

function normalizeProfileCountry(country?: string | null): PricingRegion | null {
  if (country === 'NG') return 'NG';
  if (country === 'GB' || country === 'UK') return 'UK';
  return null;
}

function fallbackRegionFromGeo(region?: GeoRegion): PricingRegion {
  // Match the existing UK-first fallback already used across the pricing/signup flow.
  return region === 'NG' ? 'NG' : 'UK';
}

export default function PricingPage() {
  const [region, setRegion] = useState<PricingRegion>('UK');

  useEffect(() => {
    let active = true;
    const session = getValidSession();

    const geoRequest = window.fetch('/api/geo')
      .then(response => response.ok ? response.json() as Promise<GeoResponse> : null)
      .catch(() => null);

    const profileRequest = session?.token
      ? window.fetch('/api/users/profile', {
        headers: {
          Authorization: 'Bearer ' + session.token,
        },
      })
        .then(response => response.ok ? response.json() as Promise<ProfileResponse> : null)
        .catch(() => null)
      : Promise.resolve<ProfileResponse | null>(null);

    void Promise.all([geoRequest, profileRequest]).then(([geo, profile]) => {
      if (!active) return;
      const profileRegion = normalizeProfileCountry(profile?.data?.country);
      setRegion(profileRegion ?? fallbackRegionFromGeo(geo?.region));
    });

    return () => {
      active = false;
    };
  }, []);

  const visiblePlans = plansByRegion[region];
  const regionLabel = region === 'NG' ? 'Nigeria' : 'United Kingdom';
  const currencyLabel = region === 'NG' ? 'NGN (₦)' : 'GBP (£)';
  const verificationNote = verificationNotesByRegion[region];

  return (
    <>
      <Helmet>
        <title>Membership Pricing — PadiHub</title>
        <meta
          name="description"
          content="Simple, region-aware monthly pricing for PadiHub's Basic and Premium subscriptions."
        />
        <link rel="canonical" href="https://padihub.com/pricing" />
        <meta property="og:title" content="Membership Pricing — PadiHub" />
        <meta
          property="og:description"
          content="Compare PadiHub's Basic and Premium monthly subscription tiers."
        />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <script type="application/ld+json">{_jsonLd}</script>
      </Helmet>

      <style>{`
        .pricing-cards { display: grid; grid-template-columns: 1fr; gap: 2rem; max-width: 72rem; margin: 0 auto; }
        @media (min-width: 768px) { .pricing-cards { grid-template-columns: 1fr 1fr; } }
        .info-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; max-width: 40rem; margin: 0 auto; }
        .shared-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; }
        @media (min-width: 640px) { .shared-grid { grid-template-columns: 1fr 1fr; } }
        @media (min-width: 1024px) { .shared-grid { grid-template-columns: repeat(4, 1fr); } }
        .trust-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; text-align: center; justify-items: center; }
        .cta-btns { display: flex; flex-direction: column; gap: 1rem; justify-content: center; }
        @media (min-width: 640px) { .cta-btns { flex-direction: row; } }
      `}</style>

      <section className="py-16 md:py-24" style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: 384, height: 384, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.1, background: '#F59E0B', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>Simple pricing</p>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif', lineHeight: 1.15 }}>
            Two plans. <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Clear group limits.</span>
          </h1>
          <p style={{ color: '#D1D5DB', fontSize: 17, margin: '0 auto 24px', maxWidth: '40rem' }}>
            Pick the PadiHub membership that matches how many savings groups you want to create and how many communities you want to join.
          </p>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, padding: '10px 16px', borderRadius: 999, background: 'rgba(255,255,255,0.06)', color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>
            <span>Showing {regionLabel} pricing</span>
            <span style={{ color: 'rgba(255,255,255,0.35)' }}>•</span>
            <span>{currencyLabel}</span>
          </div>
        </div>
      </section>

      <section style={{ padding: '5rem 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Membership tiers</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#111827', marginBottom: 12, fontFamily: 'Nunito, sans-serif' }}>Compare Basic and Premium</h2>
            <p style={{ color: '#6B7280', fontSize: 16, maxWidth: '42rem', margin: '0 auto' }}>
              The main difference is how many groups you can create and how many groups you can be part of at once.
            </p>
          </div>

          <div className="pricing-cards">
            {visiblePlans.map((plan) => (
              <div
                key={plan.key}
                style={{
                  position: 'relative',
                  borderRadius: 28,
                  padding: 32,
                  display: 'flex',
                  flexDirection: 'column',
                  background: plan.recommended ? 'linear-gradient(135deg, #0F172A, #1A1A2E)' : '#fff',
                  border: plan.recommended ? 'none' : '1px solid #E5E7EB',
                  boxShadow: plan.recommended ? '0 8px 40px rgba(46,175,111,0.22)' : '0 2px 16px rgba(0,0,0,0.05)',
                }}
              >
                {plan.recommended && (
                  <div style={{ position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)' }}>
                    <span style={{ padding: '6px 20px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 12px rgba(46,175,111,0.35)', whiteSpace: 'nowrap' }}>
                      Most capacity
                    </span>
                  </div>
                )}

                <div style={{ marginBottom: 28 }}>
                  <p style={{ fontWeight: 700, marginBottom: 8, color: plan.recommended ? 'rgba(255,255,255,0.65)' : '#6B7280', fontSize: 13 }}>{plan.name}</p>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 42, fontWeight: 800, color: plan.recommended ? '#fff' : '#111827', fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>{plan.price}</span>
                    <span style={{ fontSize: 14, marginBottom: 6, color: plan.recommended ? 'rgba(255,255,255,0.55)' : '#6B7280' }}>/month</span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: plan.recommended ? 'rgba(255,255,255,0.75)' : '#4B5563' }}>{plan.summary}</p>
                </div>

                <div style={{ display: 'grid', gap: 14, marginBottom: 24 }}>
                  {[
                    plan.createLimitLabel,
                    plan.joinLimitLabel,
                  ].map((limit) => (
                    <div
                      key={limit}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderRadius: 18,
                        padding: '14px 16px',
                        background: plan.recommended ? 'rgba(255,255,255,0.08)' : '#F9FAFB',
                        border: plan.recommended ? '1px solid rgba(255,255,255,0.08)' : '1px solid #E5E7EB',
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(46,175,111,0.14)', flexShrink: 0 }}>
                        <Users size={18} style={{ color: '#2EAF6F' }} />
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700, color: plan.recommended ? '#fff' : '#111827' }}>{limit}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28, flex: 1 }}>
                  {[...plan.highlights, ...commonFeatures].map((feature) => (
                    <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle size={15} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: plan.recommended ? 'rgba(255,255,255,0.82)' : '#374151' }}>{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  to="/get-started"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '14px 0',
                    borderRadius: 16,
                    fontWeight: 700,
                    fontSize: 15,
                    textDecoration: 'none',
                    transition: 'opacity 0.2s',
                    background: plan.recommended ? 'linear-gradient(135deg, #2EAF6F, #1d8a55)' : '#111827',
                    color: '#fff',
                    boxShadow: plan.recommended ? '0 4px 16px rgba(46,175,111,0.28)' : 'none',
                  }}
                >
                  Choose {plan.name} <ArrowRight size={16} />
                </Link>
              </div>
            ))}
          </div>

          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 13, marginTop: 20 }}>
            Creating a group also counts as being a member of that group.
          </p>
          <p style={{ textAlign: 'center', color: '#6B7280', fontSize: 13, marginTop: 8, maxWidth: '40rem', marginLeft: 'auto', marginRight: 'auto' }}>
            Subscriptions are only charged after successful identity verification. Monthly contributions are subject to processing fees with final group payouts made in full. See our{' '}
            <Link to="/terms" style={{ color: '#2EAF6F', fontWeight: 700, textDecoration: 'underline' }}>Terms of Service</Link> for full details.
          </p>

          <div className="info-grid" style={{ marginTop: 40 }}>
            {[verificationNote].map((card) => (
              <div key={card.title} style={{ borderRadius: 24, padding: 24, background: '#fff', border: '1px solid #E5E7EB', boxShadow: '0 2px 16px rgba(0,0,0,0.04)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#2EAF6F', marginBottom: 10 }}>{card.title}</p>
                <p style={{ color: '#4B5563', fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>{card.body}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {card.bullets.map((bullet) => (
                    <div key={bullet} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <CheckCircle size={15} style={{ color: '#2EAF6F', flexShrink: 0, marginTop: 2 }} />
                      <span style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{bullet}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '72rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>Included with every plan</p>
            <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 800, color: '#111827', fontFamily: 'Nunito, sans-serif' }}>Everything you need to save together with confidence</h2>
          </div>
          <div className="shared-grid">
            {commonFeatures.map((feature) => (
              <div key={feature} style={{ borderRadius: 24, padding: '1.5rem', background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <CheckCircle size={18} style={{ color: '#2EAF6F', marginBottom: 14 }} />
                <p style={{ fontSize: 15, fontWeight: 700, color: '#111827', lineHeight: 1.5 }}>{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '4rem 0', background: '#F9FAFB', borderTop: '1px solid #F3F4F6' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div className="trust-grid">
            {[
              { icon: ArrowRight, title: 'Cancel anytime', desc: 'Stay flexible as your savings groups grow and your needs change.', color: '#8B5CF6' },
            ].map((item) => (
              <div key={item.title} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${item.color}12`, flexShrink: 0 }}>
                  <item.icon size={22} style={{ color: item.color }} />
                </div>
                <p style={{ fontWeight: 700, color: '#111827' }}>{item.title}</p>
                <p style={{ fontSize: 13, color: '#6B7280' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '5rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, width: 320, height: 320, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center', position: 'relative' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>
            Ready to build your savings community?
          </h2>
          <p style={{ color: '#D1D5DB', marginBottom: 32 }}>
            Create your account, choose the tier that fits your role, and start saving together with confidence.
          </p>
          <div className="cta-btns">
            <Link
              to="/get-started"
              style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, textDecoration: 'none', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', boxShadow: '0 4px 20px rgba(46,175,111,0.4)' }}
            >
              Get started <ArrowRight size={18} />
            </Link>
            <Link
              to="/membership"
              style={{ padding: '14px 32px', borderRadius: 16, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              View membership benefits
            </Link>
          </div>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 24 }}>
            {regionLabel} pricing shown · Cancel anytime
          </p>
        </div>
      </section>
    </>
  );
}
