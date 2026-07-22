import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Mail, ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/forgot-password#webpage\",\"name\":\"Reset your password — PadiHub\",\"url\":\"https://padihub.com/forgot-password\",\"description\":\"Reset your PadiHub password and get back to your community.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always show success — prevents email enumeration
      // (backend returns 200 whether or not the email exists)
      if (res.ok || res.status === 200) {
        setSent(true);
      } else {
        const json = await res.json().catch(() => ({}));
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
        <title>Reset your password — PadiHub</title>
        <meta name="description" content="Reset your PadiHub password and get back to your community." />
        <link rel="canonical" href="https://padihub.com/forgot-password" />
        <meta property="og:title" content="Reset your password — PadiHub" />
        <meta property="og:description" content="Reset your PadiHub password and get back to your community." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
              <script type="application/ld+json">{_jsonLd}</script>
</Helmet>
      <h1 className="sr-only">Reset your PadiHub password</h1>

      <AuthLayout title="Reset your password 🔑" subtitle="No worries — it happens to the best of us. Enter your email and we'll send you a reset link.">
        {sent ? (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(46,175,111,0.1)' }}>
              <CheckCircle size={40} style={{ color: '#2EAF6F' }} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>Check your inbox!</h3>
            <p className="text-gray-500 text-sm leading-relaxed mb-8">
              If <strong>{email}</strong> is registered with PadiHub, you'll receive a password reset link shortly. It expires in 1 hour.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Didn't receive it? Check your spam folder or{' '}
              <button onClick={() => setSent(false)} className="font-semibold hover:underline" style={{ color: '#2EAF6F' }}>
                try again
              </button>.
            </p>
            <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: '#2EAF6F' }}>
              <ArrowLeft size={16} /> Back to login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && (
              <div className="rounded-2xl p-4 text-sm font-medium" style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full pl-11 pr-4 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all"
                  style={{ '--tw-ring-color': '#2EAF6F' } as React.CSSProperties}
                />
              </div>
            </div>

            <Button type="submit" disabled={loading || !email} className="w-full rounded-2xl py-3.5 font-bold text-base gap-2 mt-2"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </span>
              ) : (
                <span className="flex items-center gap-2">Send reset link <ArrowRight size={18} /></span>
              )}
            </Button>

            <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-700 mt-2">
              <ArrowLeft size={16} /> Back to login
            </Link>
          </form>
        )}
      </AuthLayout>
    </>
  );
}
