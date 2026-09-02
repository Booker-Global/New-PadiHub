import { how_it_works } from 'virtual:content';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { UserPlus, CreditCard, Users, PiggyBank, BarChart2, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResolvedPricingRegion } from '@/lib/pricingRegion';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/how-it-works#webpage\",\"name\":\"How PadiHub Works — Rotating Savings Made Simple\",\"url\":\"https://padihub.com/how-it-works\",\"description\":\"Learn how PadiHub works — register, subscribe, create or join a savings group, contribute monthly and receive your payout. Six simple steps.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

// Shows only the visitor's own region's price (never both UK and Nigeria at
// once) — see useResolvedPricingRegion for the detection order.
const planDetailsByRegion: Record<'UK' | 'NG', string[]> = {
  UK: [
    'Basic: £4.99/month. Join up to 3 savings groups; cannot create a group.',
    'Premium: £14.99/month. Create up to 3 savings groups and join up to 5 more (8 group memberships total).',
  ],
  NG: [
    'Basic: ₦5,000/month. Join up to 3 savings groups; cannot create a group.',
    'Premium: ₦10,000/month. Create up to 3 savings groups and join up to 5 more (8 group memberships total).',
  ],
};



const stepsMeta = [
  {
    icon: UserPlus
  },
  {
    icon: CreditCard
  },
  {
    icon: Users
  },
  {
    icon: PiggyBank
  },
  {
    icon: BarChart2
  },
  {
    icon: ArrowRight
  },
];

export default function HowItWorksPage() {
  const region = useResolvedPricingRegion();
  const steps = how_it_works.steps.map(step => {
    if (step.title === 'Subscribe') {
      return {
        ...step,
        desc: 'Choose the monthly plan that matches how you want to save and grow with your community.',
        details: [
          ...planDetailsByRegion[region],
          region === 'NG'
            ? 'Resolve your bank account details, then subscribe — your subscription is only charged once resolve succeeds'
            : 'Verify your identity right here on PadiHub, then subscribe — your card is only charged once verification succeeds',
          'Cancel anytime',
        ],
      };
    }

    if (step.title === 'Contribute Monthly') {
      return {
        ...step,
        details: step.details.map((detail, detailIndex) => detailIndex === 1
          ? 'Pay securely — an itemised processing-fee surcharge is shown before you confirm'
          : detail),
      };
    }

    if (step.title === 'Receive Your Payout') {
      return {
        ...step,
        details: [...step.details, 'Your first payout may take 7–14 days; payouts after that typically arrive within 3 business days'],
      };
    }

    return step;
  });

  return (
    <>
      <Helmet>
        <title>How PadiHub Works — Rotating Savings Made Simple</title>
        <meta name="description" content="Learn how PadiHub works — register, subscribe, create or join a savings group, contribute monthly and receive your payout. Six simple steps." />
        <link rel="canonical" href="https://padihub.com/how-it-works" />
              <meta property="og:title" content="How PadiHub Works — Rotating Savings Made Simple" />
        <meta property="og:description" content="Learn how PadiHub works — register, subscribe, create or join a savings group, contribute monthly and receive your payout. Six simple steps." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>
      <style>{`
        .hiw-step { display: grid; grid-template-columns: 1fr; gap: 2.5rem; align-items: center; }
        @media (min-width: 768px) { .hiw-step { grid-template-columns: 1fr 1fr; } }
        .hiw-step-reverse { order: 0; }
        @media (min-width: 768px) { .hiw-step-reverse { order: -1; } }
      `}</style>
      {/* Hero */}
      <section style={{ padding: '6rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ position: 'absolute', top: 40, right: 40, width: 256, height: 256, borderRadius: '50%', filter: 'blur(60px)', opacity: 0.15, background: '#2EAF6F', pointerEvents: 'none' }} />
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#2EAF6F', marginBottom: 16 }}>How it works</p>
          <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>How PadiHub Works — Rotating Savings Made Simple</h1>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: 'Nunito, sans-serif', lineHeight: 1.2 }}>
            Saving together has never been{' '}
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              this simple.
            </span>
          </h2>
          <p style={{ color: '#D1D5DB', fontSize: 18, maxWidth: '42rem', margin: '0 auto' }}>
            Six steps from registration to receiving your payout.
          </p>
        </div>
      </section>

      {/* Steps */}
      <section style={{ padding: '6rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4rem' }}>
            {steps.map((step, i) => {
              const Icon = stepsMeta[i].icon;
              return (
                <div key={i} className="hiw-step">
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                      <span style={{ fontSize: 48, fontWeight: 900, opacity: 0.1, color: step.color, fontFamily: 'Nunito, sans-serif', lineHeight: 1 }}>{step.step}</span>
                      <div style={{ width: 48, height: 48, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${step.color}15`, flexShrink: 0 }}>
                        <Icon size={24} style={{ color: step.color }} />
                      </div>
                    </div>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827', marginBottom: 12, fontFamily: 'Nunito, sans-serif' }}>{step.title}</h2>
                    <p style={{ color: '#6B7280', lineHeight: 1.7, marginBottom: 20 }}>{step.desc}</p>
                    <ul style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {step.details.map(d => (
                        <li key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#4B5563' }}>
                          <CheckCircle size={15} style={{ color: step.color, flexShrink: 0 }} /> {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={i % 2 === 1 ? 'hiw-step-reverse' : ''}
                    style={{ borderRadius: 24, padding: 32, background: `${step.color}08`, border: `1px solid ${step.color}20` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
                      <Icon size={80} style={{ color: step.color, opacity: 0.3 }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '5rem 0', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Ready to start saving?</h2>
          <p style={{ color: '#D1D5DB', marginBottom: 32 }}>Register today and create or join your first savings group.</p>
          <Button asChild size="lg" style={{ borderRadius: 999, padding: '0 2.5rem', fontWeight: 700, gap: 8, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 0 30px rgba(46,175,111,0.4)' }}>
            <Link to="/get-started">Start saving together <ArrowRight size={18} /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}
