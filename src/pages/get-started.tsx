import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';
import { getApiErrorMessage } from '@/lib/api-error';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/get-started#webpage\",\"name\":\"Join PadiHub — Start saving with your community\",\"url\":\"https://padihub.com/get-started\",\"description\":\"Create your free PadiHub account and start saving smarter with your community today.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

const passwordRules = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
];

export default function GetStartedPage() {
  const navigate = useNavigate();
  // Carried over when someone lands here from a group invitation, so the
  // "Log in" link (and the verify-email step) can send them back to the
  // invitation once they have an account.
  const [searchParams] = useSearchParams();
  const redirectParam = searchParams.get('redirect');
  const redirectSuffix = redirectParam && redirectParam.startsWith('/') && !redirectParam.startsWith('//')
    ? `?redirect=${encodeURIComponent(redirectParam)}`
    : '';
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', country: 'GB' as 'GB' | 'NG' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email || !form.password) { setError('Please fill in all fields.'); return; }
    const failedRule = passwordRules.find(r => !r.test(form.password));
    if (failedRule) { setError(`Password requirement not met: ${failedRule.label.toLowerCase()}.`); return; }
    if (!agreed) { setError('Please agree to the Terms of Service and Privacy Policy.'); return; }

    // Split "Full name" into first_name / last_name; treat everything after
    // the first space as last_name, defaulting last_name to a single dash if
    // the user entered only one word.
    const parts = form.name.trim().split(/\s+/);
    const first_name = parts[0];
    const last_name  = parts.slice(1).join(' ') || '-';

    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name,
          last_name,
          email:    form.email,
          password: form.password,
          country:  form.country,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        // Surface the server's own error message (e.g. "Email already registered.")
        setError(getApiErrorMessage(json, 'Registration failed. Please try again.'));
        return;
      }
      // Registration succeeded — verification email sent by the server.
      // Redirect to verify-email so the user knows to check their inbox.
      navigate(`/verify-email${redirectSuffix}`, { state: { email: form.email, fromRegister: true } });
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Join PadiHub — Start saving with your community</title>
        <meta name="description" content="Create your free PadiHub account and start saving smarter with your community today." />
        <link rel="canonical" href="https://padihub.com/get-started" />
              <meta property="og:title" content="Join PadiHub — Start saving with your community" />
        <meta property="og:description" content="Create your free PadiHub account and start saving smarter with your community today." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>
      <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Join PadiHub — Create your free account</h1>
      <AuthLayout title="Join PadiHub 🚀" subtitle="Create your free account and start your community savings journey today." step={1} totalSteps={5}>
        {/* Social login */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Sign up with Google', icon: '🔵' },
            { label: 'Sign up with Apple', icon: '⚫' },
            { label: 'Sign up with Microsoft', icon: '🟦' },
          ].map(s => (
            <button key={s.label} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 12, padding: '12px 16px', borderRadius: 16,
              border: '1px solid #E5E7EB', fontSize: 14, fontWeight: 600,
              color: '#374151', background: '#fff', cursor: 'pointer', boxSizing: 'border-box'
            }}>
              <span>{s.icon}</span> {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, whiteSpace: 'nowrap' }}>or sign up with email</span>
          <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div style={{ borderRadius: 16, padding: 16, fontSize: 14, fontWeight: 500, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Full name</label>
            <div style={{ position: 'relative' }}>
              <User size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input type="text" value={form.name} onChange={set('name')} placeholder="Your full name"
                data-testid="signup-name"
                style={{ width: '100%', paddingLeft: 44, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Email address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input type="email" value={form.email} onChange={set('email')} placeholder="you@example.com"
                data-testid="signup-email"
                style={{ width: '100%', paddingLeft: 44, paddingRight: 16, paddingTop: 14, paddingBottom: 14, borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Country</label>
            <select value={form.country} onChange={set('country')}
              data-testid="signup-country"
              style={{ width: '100%', padding: '14px 16px', borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box', fontFamily: 'inherit', appearance: 'auto' }}>
              <option value="GB">🇬🇧 United Kingdom</option>
              <option value="NG">🇳🇬 Nigeria</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', pointerEvents: 'none' }} />
              <input type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder="Create a strong password"
                data-testid="signup-password"
                style={{ width: '100%', paddingLeft: 44, paddingRight: 48, paddingTop: 14, paddingBottom: 14, borderRadius: 16, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0, display: 'flex', alignItems: 'center' }}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.password && (
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {passwordRules.map(r => (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <CheckCircle size={12} style={{ color: r.test(form.password) ? '#2EAF6F' : '#D1D5DB', flexShrink: 0 }} />
                    <span style={{ color: r.test(form.password) ? '#2EAF6F' : '#9CA3AF' }}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              data-testid="signup-agree"
              style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: '#2EAF6F' }} />
            <span style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.6 }}>
              I agree to PadiHub's{' '}
              <Link to="/terms" style={{ fontWeight: 600, color: '#2EAF6F', textDecoration: 'none' }}>Terms of Service</Link>
              {' '}and{' '}
              <Link to="/privacy" style={{ fontWeight: 600, color: '#2EAF6F', textDecoration: 'none' }}>Privacy Policy</Link>
            </span>
          </label>

          <Button type="submit" disabled={loading}
            data-testid="signup-submit"
            style={{ width: '100%', borderRadius: 16, padding: '14px 24px', fontWeight: 700, fontSize: 16, background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, boxSizing: 'border-box' }}>
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                Creating account...
              </>
            ) : (
              <>Create my account <ArrowRight size={18} /></>
            )}
          </Button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 14, color: '#6B7280', marginTop: 24 }}>
          Already have an account?{' '}
          <Link to={`/login${redirectSuffix}`} style={{ fontWeight: 700, color: '#2EAF6F', textDecoration: 'none' }}>Log in</Link>
        </p>
      </AuthLayout>
    </>
  );
}
