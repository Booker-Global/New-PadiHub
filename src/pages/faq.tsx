import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FAQ_ENTRIES } from './help/faqData';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/faq#webpage\",\"name\":\"FAQ — PadiHub Frequently Asked Questions\",\"url\":\"https://padihub.com/faq\",\"description\":\"Answers to the most common questions about PadiHub — Trust Score™, pricing, savings groups and more.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

export default function FAQPage() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <Helmet>
        <title>FAQ — PadiHub Frequently Asked Questions</title>
        <meta name="description" content="Answers to the most common questions about PadiHub — Trust Score™, pricing, savings groups and more." />
        <link rel="canonical" href="https://padihub.com/faq" />
        <meta property="og:title" content="FAQ — PadiHub Frequently Asked Questions" />
        <meta property="og:description" content="Answers to the most common questions about PadiHub — Trust Score™, pricing, savings groups and more." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <script type="application/ld+json">{_jsonLd}</script>
      </Helmet>

      <section style={{ padding: '6rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>FAQ</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>Got questions?</h1>
          <p style={{ color: '#D1D5DB', fontSize: 18 }}>We&apos;ve got answers. Everything you need to know about PadiHub.</p>
        </div>
      </section>

      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 48 }}>
            {FAQ_ENTRIES.map((faq, i) => (
              <MotionDiv key={faq.q} style={{ borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1px solid #E5E7EB' }}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <span style={{ fontWeight: 700, color: '#111827', paddingRight: 16, fontSize: 15 }}>{faq.q}</span>
                  <ChevronDown size={18} style={{ color: '#9CA3AF', flexShrink: 0, transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                </button>
                <AnimatePresence>
                  {open === i && (
                    <MotionDiv
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      style={{ overflow: 'hidden' }}
                    >
                      <p style={{ padding: '0 20px 20px', color: '#6B7280', fontSize: 14, lineHeight: 1.7 }}>{faq.a}</p>
                    </MotionDiv>
                  )}
                </AnimatePresence>
              </MotionDiv>
            ))}
          </div>

          <div style={{ textAlign: 'center', borderRadius: 24, padding: 32, background: 'rgba(46,175,111,0.05)', border: '1px solid rgba(46,175,111,0.15)' }}>
            <h3 style={{ fontWeight: 800, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>Still have questions?</h3>
            <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 16 }}>Our team is here to help. Get in touch and we&apos;ll respond within 24 hours.</p>
            <Button asChild style={{ borderRadius: 999, fontWeight: 700, background: '#2EAF6F', color: '#fff' }}>
              <Link to="/contact" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Contact us <ArrowRight size={16} /></Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
