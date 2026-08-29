import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Eye, EyeOff, Mail, Lock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';
import { getApiErrorMessage } from '@/lib/api-error';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/login#webpage\",\"name\":\"Log in — PadiHub\",\"url\":\"https://padihub.com/login\",\"description\":\"Log in to your PadiHub account and continue your community savings journey.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(getApiErrorMessage(json, 'Login failed. Please check your credentials.'));
        return;
      }
      // Store JWT and user info for header/dashboard use
      const { token, user } = json.data;
      const sessionData = {
        token,
        name: user.display_name || user.first_name || email.split('@')[0],
        trust: user.trust_score ?? 0,
        email: user.email,
        userId: user.id,
        role: user.role,
      };
      try {
        localStorage.setItem('padihub_user', JSON.stringify(sessionData));
        sessionStorage.setItem('padihub_session', JSON.stringify(sessionData));
      } catch { /* storage unavailable */ }
      navigate('/dashboard');
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Log in — PadiHub</title>
        <meta name="description" content="Log in to your PadiHub account and continue your community savings journey." />
        <link rel="canonical" href="https://padihub.com/login" />
        <meta property="og:title" content="Log in — PadiHub" />
        <meta property="og:description" content="Log in to your PadiHub account and continue your community savings journey." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
              <script type="application/ld+json">{_jsonLd}</script>
</Helmet>
      <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Log in to PadiHub</h1>

      <AuthLayout title="Welcome back 👋" subtitle="Log in to your PadiHub account and pick up where you left off.">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Email address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                data-testid="login-email"
                style={{ width: '100%', paddingLeft: 44, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Password</label>
              <Link to="/forgot-password" style={{ fontSize: 12, fontWeight: 600, color: '#2EAF6F', textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                data-testid="login-password"
                style={{ width: '100%', paddingLeft: 44, paddingRight: 48, paddingTop: 14, paddingBottom: 14, borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex', alignItems: 'center' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <Button type="submit" disabled={loading}
            data-testid="login-submit"
            style={{ width: '100%', borderRadius: 16, padding: '14px 24px', fontWeight: 700, fontSize: 16, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, boxSizing: 'border-box' }}>
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                Logging in...
              </>
            ) : (
              <>Log in <ArrowRight size={18} /></>
            )}
          </Button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 14, color: '#6B7280', marginTop: 24 }}>
          Don't have an account?{' '}
          <Link to="/get-started" style={{ fontWeight: 700, color: '#2EAF6F', textDecoration: 'none' }}>
            Join PadiHub free
          </Link>
        </p>
      </AuthLayout>
    </>
  );
}
