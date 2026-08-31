import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { FileText, Shield, Users, AlertTriangle, ChevronRight } from 'lucide-react';
import { getValidSession } from '@/lib/session';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/terms#webpage\",\"name\":\"Terms of Service — PadiHub\",\"url\":\"https://padihub.com/terms\",\"description\":\"PadiHub's Terms of Service — the rules and agreements that govern your use of the world's trusted Community Savings Infrastructure Platform.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

type TermsRegion = 'UK' | 'NG';
type GeoResponse = { region?: 'UK' | 'NG' | 'BOTH' };
type ProfileResponse = { success?: boolean; data?: { country?: string | null } };

function normalizeProfileCountry(country?: string | null): TermsRegion | null {
  if (country === 'NG') return 'NG';
  if (country === 'GB' || country === 'UK') return 'UK';
  return null;
}


const sections = [
  {
    id: 'acceptance',
    title: '1. Acceptance of Terms',
    icon: FileText,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Agreement',
        text: 'By creating a PadiHub account or using any part of the PadiHub platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use PadiHub.',
      },
      {
        subtitle: 'Updates to Terms',
        text: 'We may update these Terms from time to time. We will notify you of significant changes by email or through the platform. Continued use of PadiHub after changes constitutes acceptance of the updated Terms.',
      },
      {
        subtitle: 'Eligibility',
        text: 'You must be at least 18 years old to use PadiHub. By using the platform, you confirm that you meet this requirement and that the information you provide is accurate.',
      },
    ],
  },
  {
    id: 'platform-description',
    title: '2. Platform Description',
    icon: Users,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'What PadiHub Is',
        text: 'PadiHub is a Community Savings Infrastructure Platform that provides digital tools for communities to organise, govern, and coordinate savings activities. PadiHub is not a bank, financial institution, payment processor, or investment service.',
      },
      {
        subtitle: 'What PadiHub Is Not',
        text: 'PadiHub does not hold, process, or transfer funds on behalf of members or communities. PadiHub does not provide financial advice, investment recommendations, or regulated financial services. All financial transactions between community members are conducted independently of PadiHub.',
      },
      {
        subtitle: 'Trust Score™',
        text: 'Trust Score™ is a reputation metric calculated from your activity on PadiHub. It is an informational tool for community use and does not constitute a credit score, financial assessment, or regulated rating.',
      },
    ],
  },
  {
    id: 'membership',
    title: '3. Membership & Subscriptions',
    icon: Shield,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'Subscription Plans',
        text: (region: TermsRegion) => region === 'NG'
          ? 'PadiHub offers exactly two monthly-only subscription tiers with no annual option and no free trial: Pro Group at ₦5,000/month, and Elite Group at ₦10,000/month. Pro Group lets a member create ONE savings group and be a member of up to 5 groups total. Elite Group lets a member create up to SEVEN savings groups and be a member of up to 10 groups total.'
          : 'PadiHub offers exactly two monthly-only subscription tiers with no annual option and no free trial: Pro Group at £4.99/month, and Elite Group at £9.99/month. Pro Group lets a member create ONE savings group and be a member of up to 5 groups total. Elite Group lets a member create up to SEVEN savings groups and be a member of up to 10 groups total.',
      },
      {
        subtitle: 'Cancellation',
        text: 'You may cancel your subscription at any time through Settings → Subscription & Billing. Cancellation takes effect at the end of your current billing period. We do not offer refunds for partial periods.',
      },
      {
        subtitle: 'Account Suspension',
        text: 'We reserve the right to suspend or terminate accounts that violate these Terms, engage in fraudulent activity, or harm the PadiHub community.',
      },
    ],
  },
  {
    id: 'community-rules',
    title: '4. Community Rules & Conduct',
    icon: Users,
    color: '#F59E0B',
    content: [
      {
        subtitle: 'Respectful Participation',
        text: 'All members must treat each other with respect. Harassment, discrimination, hate speech, or abusive behaviour of any kind is strictly prohibited and will result in immediate account suspension.',
      },
      {
        subtitle: 'Honest Representation',
        text: 'You must represent yourself honestly on PadiHub. Creating fake accounts, misrepresenting your identity, or manipulating your Trust Score™ through dishonest means is prohibited.',
      },
      {
        subtitle: 'Community Governance',
        text: 'When participating in community governance, you must vote honestly and in good faith. Attempting to manipulate governance outcomes through coordinated inauthentic behaviour is prohibited.',
      },
      {
        subtitle: 'Financial Responsibility',
        text: 'PadiHub facilitates community coordination but is not responsible for financial commitments made between community members. Members are individually responsible for their savings commitments.',
      },
    ],
  },
  {
    id: 'intellectual-property',
    title: '5. Intellectual Property',
    icon: FileText,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'PadiHub IP',
        text: 'PadiHub™, Trust Score™, and Community DNA™ are trademarks of PadiHub. The platform, its design, and all original content are protected by copyright and other intellectual property laws.',
      },
      {
        subtitle: 'Your Content',
        text: 'You retain ownership of content you create on PadiHub (profile information, community posts, etc.). By posting content, you grant PadiHub a licence to display and use that content to provide the service.',
      },
      {
        subtitle: 'Restrictions',
        text: 'You may not copy, modify, distribute, or create derivative works from PadiHub\'s platform, design, or proprietary features without our written permission.',
      },
    ],
  },
  {
    id: 'liability',
    title: '6. Limitation of Liability',
    icon: AlertTriangle,
    color: '#EF4444',
    content: [
      {
        subtitle: 'No Financial Liability',
        text: 'PadiHub is not liable for any financial losses arising from community savings activities, missed contributions, or disputes between community members. All financial arrangements are between members directly.',
      },
      {
        subtitle: 'Service Availability',
        text: 'We aim to provide a reliable service but cannot guarantee 100% uptime. PadiHub is not liable for losses arising from service interruptions, technical failures, or data loss beyond our reasonable control.',
      },
      {
        subtitle: 'Limitation',
        text: 'To the maximum extent permitted by law, PadiHub\'s total liability to you for any claim arising from these Terms or your use of the platform shall not exceed the amount you paid for your subscription in the 12 months preceding the claim.',
      },
    ],
  },
  {
    id: 'governing-law',
    title: '7. Governing Law',
    icon: Shield,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'UK Members',
        text: 'For members based in the United Kingdom, these Terms are governed by the laws of England and Wales. Any disputes shall be subject to the exclusive jurisdiction of the courts of England and Wales.',
      },
      {
        subtitle: 'Nigerian Members',
        text: 'For members based in Nigeria, these Terms are governed by the laws of the Federal Republic of Nigeria. Any disputes shall be subject to the jurisdiction of the courts of Nigeria.',
      },
      {
        subtitle: 'Dispute Resolution',
        text: 'We encourage members to contact us first to resolve any disputes informally. If a dispute cannot be resolved informally, it shall be referred to mediation before any legal proceedings are commenced.',
      },
    ],
  },
  {
    id: 'identity-verification',
    title: '8. Identity Verification',
    icon: Shield,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Requirement to Verify',
        text: 'To maintain the safety and integrity of PadiHub savings groups, users who create a savings group are required to complete identity verification before their group becomes active. This requirement applies to all group leaders regardless of country.',
      },
      {
        subtitle: 'UK Users — Stripe Identity',
        text: 'UK-based users will be verified using Stripe Identity, a secure third-party identity verification service operated by Stripe, Inc. You will be asked to provide a government-issued photo ID and a selfie. PadiHub does not store your identity documents — they are processed and held by Stripe in accordance with their privacy policy.',
      },
      {
        subtitle: 'Nigerian Users — BVN Verification',
        text: 'Nigerian users will be verified via BVN (Bank Verification Number) confirmation through Flutterwave. You will be asked to provide your BVN, after which an OTP will be sent to your BVN-registered phone number. PadiHub does not store your BVN — only a verification reference is retained.',
      },
    ],
  },
  {
    id: 'identity-verification-fee-uk',
    title: '9. Identity Verification Fee (UK Users)',
    icon: AlertTriangle,
    color: '#F59E0B',
    region: 'UK' as TermsRegion,
    content: [
      {
        subtitle: 'One-Time Fee',
        text: 'A one-time identity verification fee of £1.50 will be added to your first month\'s subscription invoice. This fee covers the cost of the Stripe Identity verification service and is charged once per account.',
      },
      {
        subtitle: 'How It Appears on Your Invoice',
        text: 'The fee will appear on your invoice as "Identity Verification Fee (one-time)". It is added automatically when you initiate identity verification and will be collected together with your first monthly subscription payment.',
      },
      {
        subtitle: 'First Invoice Total',
        text: 'Your first invoice will include your selected monthly plan plus the £1.50 identity verification fee. If you subscribe to Pro Group, your first invoice total will be £6.49. If you subscribe to Elite Group, your first invoice total will be £11.49. There is no annual billing option and no free trial.',
      },
      {
        subtitle: 'Non-Refundable',
        text: 'The identity verification fee is non-refundable once verification has been initiated, regardless of the outcome of the verification process. By proceeding with identity verification, you agree to this charge.',
      },
    ],
  },
  {
    id: 'identity-verification-fee-ng',
    title: '10. Identity Verification Fee (Nigerian Users)',
    icon: Shield,
    color: '#2eafaf',
    region: 'NG' as TermsRegion,
    content: [
      {
        subtitle: 'No Charge for Nigerian Users',
        text: 'BVN verification is provided at no additional cost to Nigerian users. There is no charge for completing BVN verification through PadiHub.',
      },
      {
        subtitle: 'Standard Subscription Pricing',
        text: 'Nigerian users can subscribe to Pro Group at ₦5,000/month or Elite Group at ₦10,000/month. Pro Group lets a member create ONE savings group and be a member of up to 5 groups total. Elite Group lets a member create up to SEVEN savings groups and be a member of up to 10 groups total. There is no annual billing option, no free trial, and no identity verification surcharge.',
      },
    ],
  },
  {
    id: 'contribution-processing-fees',
    title: '11. Contribution Payment Processing Fees',
    icon: AlertTriangle,
    color: '#F59E0B',
    content: [
      {
        subtitle: 'Fee Added to Each Contribution Charge',
        text: 'When you save a payment method for your recurring group contributions, PadiHub\'s payment processors (Stripe for UK card charges, Flutterwave for Nigerian card charges) charge a processing fee on every contribution payment. This fee is added on top of your contribution amount and charged to you at the same time — it is never deducted from the group pot, so every member still receives their full contribution amount when it is their turn to be paid out.',
      },
      {
        subtitle: 'Indicative Rates',
        text: 'Stripe (UK card charges): approximately 1.5% + £0.20 per charge. Flutterwave (Nigerian card charges): approximately 1.4% per charge, capped at ₦2,000. These rates are indicative and may be updated to reflect PadiHub\'s final confirmed processor pricing; the current rate is always shown before you confirm a contribution charge.',
      },
      {
        subtitle: 'Consent',
        text: 'By ticking the payment authorization checkbox when saving a payment method, you explicitly consent to this processing fee being added to each of your recurring group contribution charges.',
      },
    ],
  },
  {
    id: 'contact',
    title: '12. Contact',
    icon: FileText,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Legal Team',
        text: 'For questions about these Terms of Service, please contact our Legal Team at hello@padihub.com.',
      },
      {
        subtitle: 'General Support',
        text: 'For general support and account questions, visit our Help Centre at padihub.com/help or contact hello@padihub.com.',
      },
    ],
  },
];

function renumberTitle(title: string, position: number) {
  return title.replace(/^\d+\./, `${position}.`);
}

export default function TermsPage() {
  const [region, setRegion] = useState<TermsRegion>('UK');

  useEffect(() => {
    let active = true;
    const session = getValidSession();

    const geoRequest = window.fetch('/api/geo')
      .then(response => response.ok ? response.json() as Promise<GeoResponse> : null)
      .catch(() => null);

    const profileRequest = session?.token
      ? window.fetch('/api/users/profile', { headers: { Authorization: 'Bearer ' + session.token } })
        .then(response => response.ok ? response.json() as Promise<ProfileResponse> : null)
        .catch(() => null)
      : Promise.resolve<ProfileResponse | null>(null);

    void Promise.all([geoRequest, profileRequest]).then(([geo, profile]) => {
      if (!active) return;
      const profileRegion = normalizeProfileCountry(profile?.data?.country);
      setRegion(profileRegion ?? (geo?.region === 'NG' ? 'NG' : 'UK'));
    });

    return () => {
      active = false;
    };
  }, []);

  const visibleSections = sections
    .filter(section => !('region' in section) || section.region === region)
    .map((section, index) => ({ ...section, title: renumberTitle(section.title, index + 1) }));

  return (
    <>
      <Helmet>
        <title>Terms of Service — PadiHub</title>
        <meta name="description" content="PadiHub's Terms of Service — the rules and agreements that govern your use of the world's trusted Community Savings Infrastructure Platform." />
        <link rel="canonical" href="https://padihub.com/terms" />
        <meta property="og:title" content="Terms of Service — PadiHub" />
        <meta property="og:description" content="The rules and agreements that govern your use of PadiHub." />
        <meta property="og:type" content="website" />
              <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden py-20" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />
        <div className="max-w-4xl mx-auto px-6 relative">
          <div>
            <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Terms of Service — PadiHub</h1>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <FileText size={22} style={{ color: '#F59E0B' }} />
              </div>
              <span className="text-sm font-bold uppercase tracking-widest" style={{ color: '#F59E0B' }}>Terms of Service</span>
            </div>
            <div style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>
              Clear, fair terms for everyone
            </div>
            <div className="text-gray-300 text-lg leading-relaxed max-w-2xl mb-6">
              These terms govern your use of PadiHub. We've written them in plain language so you know exactly what to expect.
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
              <span>Last updated: 1 June 2026</span>
              <span>·</span>
              <span>Effective: 1 June 2026</span>
              <span>·</span>
              <span>Version 1.0</span>
            </div>
          </div>
        </div>
      </section>

      {/* Important notice */}
      <div className="bg-amber-50 border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> PadiHub is not a bank, financial institution, or payment processor. We provide community coordination tools only. All financial arrangements are between community members directly.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <section style={{ padding: '64px 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px' }}>
          <div className="flex flex-col lg:flex-row gap-10">

            {/* Table of contents */}
            <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
              <div className="sticky top-24 rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 className="text-sm font-extrabold text-gray-900 mb-4 uppercase tracking-wider" style={{ fontFamily: 'Nunito, sans-serif' }}>Contents</h2>
                <nav className="flex flex-col gap-1">
                  {visibleSections.map(s => (
                    <a key={s.id} href={`#${s.id}`}
                      className="flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                      <ChevronRight size={12} />
                      {s.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0">
              <div className="flex flex-col gap-8">
                {visibleSections.map((section) => (
                  <div key={section.id} id={section.id}
                   
                    className="rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: `${section.color}12` }}>
                        <section.icon size={18} style={{ color: section.color }} />
                      </div>
                      <h2 className="text-lg font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{section.title}</h2>
                    </div>
                    <div className="flex flex-col gap-5">
                      {section.content.map((item, i) => (
                        <div key={i}>
                          <h3 className="text-sm font-bold text-gray-900 mb-1">{item.subtitle}</h3>
                          <p className="text-sm text-gray-600 leading-relaxed">{typeof item.text === 'function' ? item.text(region) : item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer CTA */}
              <div
                className="mt-8 rounded-3xl p-6 text-center" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                <p className="text-white font-bold mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Questions about these terms?</p>
                <p className="text-gray-400 text-sm mb-4">Our team is happy to clarify anything. Reach us at hello@padihub.com</p>
                <div className="r-flex-center">
                  <Link to="/contact" className="px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    Contact us
                  </Link>
                  <Link to="/privacy" className="px-6 py-3 rounded-2xl text-sm font-bold border border-white/20 text-white hover:bg-white/10 transition-all">
                    Read Privacy Policy
                  </Link>
                </div>
              </div>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
