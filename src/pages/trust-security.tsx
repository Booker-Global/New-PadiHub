import { Helmet } from '@dr.pogodin/react-helmet';
import { Shield, Lock, Eye, CheckCircle, CreditCard, Users } from 'lucide-react';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/trust-security#webpage\",\"name\":\"Trust & Security — PadiHub\",\"url\":\"https://padihub.com/trust-security\",\"description\":\"How PadiHub keeps your savings safe — secure payment processing, Trust Score™, verified members and data protection.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";


export default function TrustSecurityPage() {
  return (
    <>
      <Helmet>
        <title>Trust & Security — PadiHub</title>
        <meta name="description" content="How PadiHub keeps your savings safe — secure payment processing, Trust Score™, verified members and data protection." />
        <link rel="canonical" href="https://padihub.com/trust-security" />
              <meta property="og:title" content="Trust & Security — PadiHub" />
        <meta property="og:description" content="How PadiHub keeps your savings safe — secure payment processing, Trust Score™, verified members and data protection." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      <section style={{ padding: '6rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>Trust & Security</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 24, fontFamily: 'Nunito, sans-serif', lineHeight: 1.2 }}>
            Your savings are{' '}
            <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              safe with us.
            </span>
          </h1>
          <p style={{ color: '#D1D5DB', fontSize: 18, maxWidth: '40rem', margin: '0 auto' }}>PadiHub is built on trust. Every payment is secure, every member is verified, and every transaction is transparent.</p>
        </div>
      </section>

      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div className="r-grid-2" style={{ marginBottom: 64 }}>
            {[
              { icon: CreditCard, title: 'Secure Payments', desc: 'All payments are handled through secure, region-appropriate payment processing. We never store your card details.', color: '#2EAF6F' },
              { icon: Shield, title: 'Trust Score™', desc: 'Every member builds a Trust Score based on their payment history. On-time payments increase your score. Missed payments reduce it. This creates accountability and helps groups stay healthy.', color: '#2eafaf' },
              { icon: Lock, title: 'Data Protection', desc: 'Your personal and financial data is encrypted in transit and at rest. We follow GDPR guidelines and never share your data with third parties without your consent.', color: '#8B5CF6' },
              { icon: Users, title: 'Verified Members', desc: 'Every member goes through email verification before joining a group. Group leaders can review member Trust Scores before approving membership requests.', color: '#F59E0B' },
              { icon: Eye, title: 'Full Transparency', desc: 'Every contribution and payout within your group is visible to all members. No hidden transactions. No surprises. Complete visibility at all times.', color: '#EF4444' },
              { icon: CheckCircle, title: 'Not a Bank', desc: 'PadiHub is not a bank, wallet or financial institution. We provide the platform and tools — your payments go directly to your group through secure payment processing.', color: '#6B7280' },
            ].map((item, i) => (
              <div key={i} style={{ borderRadius: 24, padding: 28, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${item.color}15`, marginBottom: 16, flexShrink: 0 }}>
                  <item.icon size={24} style={{ color: item.color }} />
                </div>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>{item.title}</h3>
                <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.7 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ borderRadius: 24, padding: 32, textAlign: 'center', background: 'rgba(46,175,111,0.05)', border: '1px solid rgba(46,175,111,0.15)' }}>
            <h2 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 800, color: '#111827', marginBottom: 12, fontFamily: 'Nunito, sans-serif' }}>Our commitment to you</h2>
            <p style={{ color: '#6B7280', marginBottom: 24, maxWidth: '36rem', margin: '0 auto 24px' }}>PadiHub will never present itself as a bank. We will never hold your funds. We will always be transparent about how the platform works.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
              {['Not a bank', 'Not a wallet', 'Secure payments', 'GDPR compliant', 'Full transparency'].map(c => (
                <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                  <CheckCircle size={13} /> {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
