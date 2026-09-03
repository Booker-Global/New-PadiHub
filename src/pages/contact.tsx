import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Mail, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/contact#webpage\",\"name\":\"Contact PadiHub — Get in Touch\",\"url\":\"https://padihub.com/contact\",\"description\":\"Contact the PadiHub team. We're here to help with any questions about our community savings platform.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      setError('Please fill in your name, email and message.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setSent(true);
      } else {
        setError(json?.message ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact PadiHub — Get in Touch</title>
        <meta name="description" content="Contact the PadiHub team. We're here to help with any questions about our community savings platform." />
        <link rel="canonical" href="https://padihub.com/contact" />
        <meta property="og:title" content="Contact PadiHub — Get in Touch" />
        <meta property="og:description" content="Contact the PadiHub team. We're here to help with any questions about our community savings platform." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
              <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      <section style={{ padding: '6rem 0', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ maxWidth: '48rem', margin: '0 auto', padding: '0 1.25rem', textAlign: 'center', position: 'relative' }}>
          <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 16 }}>Get in touch</p>
          <h1 style={{ fontSize: 'clamp(1.75rem, 5vw, 3rem)', fontWeight: 800, color: '#fff', marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>We'd love to hear from you</h1>
          <p style={{ color: '#D1D5DB', fontSize: 17 }}>Questions, feedback or just want to say hello — we're here.</p>
        </div>
      </section>

      <section style={{ padding: '5rem 0', background: '#fff' }}>
        <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '0 1.25rem' }}>
          <div className="r-contact">
            {/* Contact info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { icon: Mail, title: 'Email us', desc: 'hello@padihub.com', sub: 'We respond within 24 hours', color: '#2EAF6F' },
                { icon: MessageSquare, title: 'Live chat', desc: 'Available in the app', sub: 'Mondays to Saturdays, 9am to 6pm', color: '#2eafaf' },
              ].map(c => (
                <div key={c.title} style={{ borderRadius: 16, padding: 20, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${c.color}15`, marginBottom: 12, flexShrink: 0 }}>
                    <c.icon size={18} style={{ color: c.color }} />
                  </div>
                  <h3 style={{ fontWeight: 700, color: '#111827', fontSize: 14, marginBottom: 4 }}>{c.title}</h3>
                  <p style={{ fontSize: 14, fontWeight: 600, color: c.color }}>{c.desc}</p>
                  <p style={{ fontSize: 12, color: '#9CA3AF' }}>{c.sub}</p>
                </div>
              ))}
            </div>

            {/* Form */}
            <div>
              {sent ? (
                <div style={{ textAlign: 'center', padding: '48px 0' }}>
                  <div style={{ width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', background: 'rgba(46,175,111,0.1)' }}>
                    <CheckCircle size={40} style={{ color: '#2EAF6F' }} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>Message sent!</h3>
                  <p style={{ color: '#6B7280' }}>We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {error && (
                    <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                      <XCircle size={15} /> {error}
                    </div>
                  )}
                  <div className="r-form-2">
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Full name</label>
                      <input type="text" value={form.name} onChange={set('name')} placeholder="Your name" required
                        style={{ width: '100%', padding: '12px 16px', borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Email</label>
                      <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required
                        style={{ width: '100%', padding: '12px 16px', borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Subject</label>
                    <select value={form.subject} onChange={set('subject')}
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                      <option value="">Select a topic</option>
                      <option>General enquiry</option>
                      <option>Technical support</option>
                      <option>Billing question</option>
                      <option>Community help</option>
                      <option>Partnership</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Message</label>
                    <textarea value={form.message} onChange={set('message')} rows={5} placeholder="Tell us how we can help..." required
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <Button type="submit" disabled={loading} style={{ borderRadius: 16, padding: '14px', fontWeight: 700, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)', border: 'none', cursor: 'pointer' }}>
                    {loading ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                        Sending...
                      </span>
                    ) : 'Send message'}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
