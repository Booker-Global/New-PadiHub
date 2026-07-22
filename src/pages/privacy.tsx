import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { Shield, Lock, Eye, Globe, Mail, ChevronRight } from 'lucide-react';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/privacy#webpage\",\"name\":\"Privacy Policy — PadiHub\",\"url\":\"https://padihub.com/privacy\",\"description\":\"PadiHub's Privacy Policy — how we collect, use, and protect your personal information on the world's trusted Community Savings Infrastructure Platform.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";


const sections = [
  {
    id: 'information-we-collect',
    title: '1. Information We Collect',
    icon: Eye,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Account Information',
        text: 'When you register for PadiHub, we collect your name, email address, country of residence, and password. This information is required to create and maintain your account.',
      },
      {
        subtitle: 'Profile Information',
        text: 'You may optionally provide a profile photo, display name, bio, and community interests. This information is visible to other members within communities you join.',
      },
      {
        subtitle: 'Community Activity',
        text: 'We collect data about your participation in communities and savings groups, including contribution records, governance votes, and community interactions. This data forms the basis of your Trust Score™ and Community Karma™.',
      },
      {
        subtitle: 'Device & Usage Data',
        text: 'We automatically collect information about how you use PadiHub, including your IP address, browser type, device identifiers, pages visited, and features used. This helps us improve the platform.',
      },
    ],
  },
  {
    id: 'how-we-use-information',
    title: '2. How We Use Your Information',
    icon: Shield,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'Providing the Service',
        text: 'We use your information to operate PadiHub, process your membership, manage your communities and savings groups, and deliver the features described in our platform.',
      },
      {
        subtitle: 'Trust Score™ & Community Karma™',
        text: 'Your activity data is used to calculate and display your Trust Score™ and Community Karma™. These are core features of the platform and are visible to community members you interact with.',
      },
      {
        subtitle: 'Communications',
        text: 'We use your email address to send account notifications, contribution reminders, governance updates, and platform announcements. You can manage your notification preferences in Settings.',
      },
      {
        subtitle: 'Platform Improvement',
        text: 'We analyse usage patterns to improve PadiHub\'s features, fix bugs, and develop new functionality. This analysis uses aggregated, anonymised data where possible.',
      },
    ],
  },
  {
    id: 'information-sharing',
    title: '3. Information Sharing',
    icon: Globe,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'Within Communities',
        text: 'When you join a community, your profile information, Trust Score™, Community Karma™, and contribution history are visible to other members of that community. Community leaders have additional visibility into member activity.',
      },
      {
        subtitle: 'PadiHub Passport™',
        text: 'If you choose to share your PadiHub Passport™, the information it contains (Trust Score™, Karma™, communities, achievements) will be accessible to anyone with the share link.',
      },
      {
        subtitle: 'Service Providers',
        text: 'We share information with trusted third-party service providers who help us operate PadiHub, including cloud hosting, email delivery, and analytics services. These providers are contractually bound to protect your data.',
      },
      {
        subtitle: 'Legal Requirements',
        text: 'We may disclose your information if required by law, court order, or to protect the rights, property, or safety of PadiHub, our members, or the public.',
      },
      {
        subtitle: 'We Never Sell Your Data',
        text: 'PadiHub does not sell, rent, or trade your personal information to third parties for their marketing purposes. Your data is used solely to provide and improve the PadiHub service.',
      },
    ],
  },
  {
    id: 'data-security',
    title: '4. Data Security',
    icon: Lock,
    color: '#F59E0B',
    content: [
      {
        subtitle: 'Security Measures',
        text: 'We implement industry-standard security measures including encryption in transit (TLS), encryption at rest, secure authentication, and regular security audits to protect your personal information.',
      },
      {
        subtitle: 'Password Security',
        text: 'Your password is hashed using industry-standard algorithms and is never stored in plain text. We recommend using a strong, unique password and enabling two-factor authentication.',
      },
      {
        subtitle: 'Data Breach Response',
        text: 'In the event of a data breach that affects your personal information, we will notify you and relevant authorities within 72 hours as required by applicable law.',
      },
    ],
  },
  {
    id: 'your-rights',
    title: '5. Your Rights',
    icon: Shield,
    color: '#EF4444',
    content: [
      {
        subtitle: 'Access & Portability',
        text: 'You have the right to access the personal information we hold about you and to receive a copy of your data in a portable format. You can request this through Settings → Export My Data.',
      },
      {
        subtitle: 'Correction',
        text: 'You can update most of your personal information directly in your Profile and Settings. If you need help correcting inaccurate information, contact our support team.',
      },
      {
        subtitle: 'Deletion',
        text: 'You have the right to request deletion of your account and personal data. Note that some information may be retained for legal compliance or to maintain the integrity of community records.',
      },
      {
        subtitle: 'Objection & Restriction',
        text: 'You have the right to object to certain processing of your data and to request that we restrict processing in certain circumstances. Contact us at privacy@padihub.com to exercise these rights.',
      },
      {
        subtitle: 'UK & Nigeria Residents',
        text: 'If you are based in the United Kingdom, you have additional rights under the UK GDPR and Data Protection Act 2018. If you are based in Nigeria, you have rights under the Nigeria Data Protection Regulation (NDPR).',
      },
    ],
  },
  {
    id: 'cookies',
    title: '6. Cookies & Tracking',
    icon: Globe,
    color: '#2EAF6F',
    content: [
      {
        subtitle: 'Essential Cookies',
        text: 'We use essential cookies to keep you logged in, maintain your session, and ensure the platform functions correctly. These cannot be disabled.',
      },
      {
        subtitle: 'Analytics Cookies',
        text: 'With your consent, we use analytics cookies to understand how members use PadiHub. This helps us improve the platform. You can opt out in your browser settings.',
      },
      {
        subtitle: 'No Advertising Cookies',
        text: 'PadiHub does not use advertising or tracking cookies for third-party advertising purposes.',
      },
    ],
  },
  {
    id: 'data-retention',
    title: '7. Data Retention',
    icon: Lock,
    color: '#8B5CF6',
    content: [
      {
        subtitle: 'Active Accounts',
        text: 'We retain your personal information for as long as your account is active or as needed to provide you with the PadiHub service.',
      },
      {
        subtitle: 'Deleted Accounts',
        text: 'When you delete your account, we will delete or anonymise your personal information within 30 days, except where we are required to retain it for legal or compliance reasons.',
      },
      {
        subtitle: 'Community Records',
        text: 'Contribution records and governance votes may be retained in anonymised form to maintain the integrity of community history, even after account deletion.',
      },
    ],
  },
  {
    id: 'contact',
    title: '8. Contact Us',
    icon: Mail,
    color: '#2eafaf',
    content: [
      {
        subtitle: 'Privacy Team',
        text: 'If you have questions about this Privacy Policy or how we handle your personal information, please contact our Privacy Team at privacy@padihub.com.',
      },
      {
        subtitle: 'Data Protection Officer',
        text: 'Our Data Protection Officer can be reached at dpo@padihub.com. For UK residents, you also have the right to lodge a complaint with the Information Commissioner\'s Office (ICO).',
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <>
      <Helmet>
        <title>Privacy Policy — PadiHub</title>
        <meta name="description" content="PadiHub's Privacy Policy — how we collect, use, and protect your personal information on the world's trusted Community Savings Infrastructure Platform." />
        <link rel="canonical" href="https://padihub.com/privacy" />
        <meta property="og:title" content="Privacy Policy — PadiHub" />
        <meta property="og:description" content="How PadiHub collects, uses, and protects your personal information." />
        <meta property="og:type" content="website" />
              <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden py-20" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ background: '#2EAF6F' }} />
        <div className="max-w-4xl mx-auto px-6 relative">
          <div>
            <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Privacy Policy — PadiHub</h1>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(46,175,111,0.15)', border: '1px solid rgba(46,175,111,0.25)' }}>
                <Shield size={22} style={{ color: '#2EAF6F' }} />
              </div>
              <span className="text-sm font-bold uppercase tracking-widest" style={{ color: '#2EAF6F' }}>Privacy Policy</span>
            </div>
            <h1 style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>
              Your privacy matters to us
            </h1>            <p className="text-gray-300 text-lg leading-relaxed max-w-2xl mb-6">
              PadiHub is built on trust and transparency. This policy explains exactly how we collect, use, and protect your personal information.
            </p>
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

      {/* Content */}
      <section style={{ padding: '64px 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px' }}>
          <div className="flex flex-col lg:flex-row gap-10">

            {/* Table of contents */}
            <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
              <div className="sticky top-24 rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 className="text-sm font-extrabold text-gray-900 mb-4 uppercase tracking-wider" style={{ fontFamily: 'Nunito, sans-serif' }}>Contents</h2>
                <nav className="flex flex-col gap-1">
                  {sections.map(s => (
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
              {/* Summary box */}
              <div
                className="rounded-3xl p-6 mb-8" style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.15)' }}>
                <h2 className="font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Summary</h2>
                <ul className="flex flex-col gap-2">
                  {[
                    'We collect only what we need to provide the PadiHub service.',
                    'We never sell your personal data to third parties.',
                    'Your Trust Score™ and Karma™ data is visible within your communities.',
                    'You can export or delete your data at any time.',
                    'We use industry-standard security to protect your information.',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <Shield size={14} className="mt-0.5 flex-shrink-0" style={{ color: '#2EAF6F' }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Sections */}
              <div className="flex flex-col gap-8">
                {sections.map((section) => (
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
                          <p className="text-sm text-gray-600 leading-relaxed">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer CTA */}
              <div
                className="mt-8 rounded-3xl p-6 text-center" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                <p className="text-white font-bold mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Questions about your privacy?</p>
                <p className="text-gray-400 text-sm mb-4">Our team is here to help. Reach us at privacy@padihub.com</p>
                <div className="r-flex-center">
                  <Link to="/contact" className="px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    Contact us
                  </Link>
                  <Link to="/terms" className="px-6 py-3 rounded-2xl text-sm font-bold border border-white/20 text-white hover:bg-white/10 transition-all">
                    Read Terms of Service
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
