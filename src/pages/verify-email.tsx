import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { CheckCircle, XCircle, Loader2, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';

export default function VerifyEmailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const emailFromState = (location.state as { email?: string } | null)?.email ?? '';
  const token = searchParams.get('token');

  const [status, setStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // If a token is in the URL, verify it automatically on mount
  useEffect(() => {
    if (!token) return;
    setStatus('verifying');
    fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (r.ok && data?.data?.token) {
          // Store the JWT + user info so the global auth state is fully
          // populated before we navigate. This prevents the onboarding page
          // from seeing an unauthenticated/unverified session on arrival.
          const { token: jwt, user } = data.data;
          const sessionData = {
            token: jwt,
            name: user.display_name || user.first_name || user.email?.split('@')[0] || '',
            trust: user.trust_score ?? 0,
            email: user.email,
            userId: user.id,
            role: user.role,
            emailVerified: true,
          };
          try {
            localStorage.setItem('padihub_user', JSON.stringify(sessionData));
            sessionStorage.setItem('padihub_session', JSON.stringify(sessionData));
          } catch { /* storage unavailable — continue anyway */ }
          setStatus('success');
          // Small tick to let React flush the state update before navigating,
          // ensuring any auth-reading components re-render with the new session.
          setTimeout(() => navigate('/onboarding', { replace: true }), 50);
        } else if (r.ok) {
          // Verification succeeded but no JWT returned (shouldn't happen with
          // current backend, but handle gracefully).
          setStatus('success');
        } else {
          setErrorMsg(data.message || 'This verification link is invalid or has expired.');
          setStatus('error');
        }
      })
      .catch(() => {
        setErrorMsg('Something went wrong. Please try again.');
        setStatus('error');
      });
  }, [token, navigate]);

  const handleResend = async () => {
    if (!emailFromState) return;
    setResending(true);
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailFromState }),
      });
      setResent(true);
    } catch {
      // silent — show resent anyway
      setResent(true);
    } finally {
      setResending(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Verify your email — PadiHub</title>
        <meta name="description" content="Verify your email address to activate your PadiHub account." />
        <link rel="canonical" href="https://padihub.com/verify-email" />
        <meta property="og:title" content="Verify your email — PadiHub" />
        <meta property="og:description" content="Verify your email address to activate your PadiHub account." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
      </Helmet>
      <h1 className="sr-only">Verify your PadiHub email address</h1>

      <AuthLayout
        title={
          status === 'success' ? 'Email verified!' :
          status === 'error'   ? 'Verification failed' :
          status === 'verifying' ? 'Verifying…' :
          'Check your email 📬'
        }
        subtitle={
          status === 'success' ? 'Your account is now active. Welcome to PadiHub!' :
          status === 'error'   ? errorMsg :
          status === 'verifying' ? 'Please wait while we verify your email address.' :
          `We've sent a verification link to your email address. Click the link in the email to activate your account.`
        }
        step={2}
        totalSteps={5}
      >
        <div className="flex flex-col items-center gap-6 py-4">

          {/* Verifying spinner */}
          {status === 'verifying' && (
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(46,175,111,0.1)' }}>
              <Loader2 size={36} className="animate-spin" style={{ color: '#2EAF6F' }} />
            </div>
          )}

          {/* Success — auto-redirecting to onboarding */}
          {status === 'success' && (
            <>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(46,175,111,0.1)' }}>
                <CheckCircle size={40} style={{ color: '#2EAF6F' }} />
              </div>
              <p className="text-sm text-gray-500 text-center">Taking you to onboarding…</p>
              {/* Fallback in case the automatic redirect doesn't fire */}
              <Button asChild className="w-full rounded-2xl py-3.5 font-bold text-base"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
                <Link to="/onboarding">Continue to onboarding</Link>
              </Button>
            </>
          )}

          {/* Error */}
          {status === 'error' && (
            <>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <XCircle size={40} style={{ color: '#EF4444' }} />
              </div>
              <div className="w-full rounded-2xl p-4 text-sm text-center"
                style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {errorMsg}
              </div>
              {emailFromState && (
                <button onClick={handleResend} disabled={resending || resent}
                  className="flex items-center gap-2 text-sm font-semibold hover:underline disabled:opacity-60"
                  style={{ color: '#2EAF6F' }}>
                  {resending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  {resent ? 'New link sent — check your inbox' : 'Send a new verification link'}
                </button>
              )}
              <Link to="/get-started" className="text-sm text-gray-400 hover:underline">
                Back to sign up
              </Link>
            </>
          )}

          {/* Idle — waiting for user to click the email link */}
          {status === 'idle' && (
            <>
              <div className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(46,175,111,0.1)' }}>
                <Mail size={36} style={{ color: '#2EAF6F' }} />
              </div>

              {emailFromState && (
                <p className="text-sm text-gray-500 text-center">
                  Link sent to <strong className="text-gray-800">{emailFromState}</strong>
                </p>
              )}

              <div className="w-full rounded-2xl p-4 text-sm text-center leading-relaxed"
                style={{ background: 'rgba(46,175,111,0.06)', border: '1px solid rgba(46,175,111,0.2)', color: '#374151' }}>
                Open your email and click <strong>"Verify Email Address"</strong> to activate your account. The link expires in 24 hours.
              </div>

              {emailFromState && (
                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-2">Didn't receive it?</p>
                  <button onClick={handleResend} disabled={resending || resent}
                    className="flex items-center gap-2 text-sm font-semibold mx-auto hover:underline disabled:opacity-60"
                    style={{ color: '#2EAF6F' }}>
                    {resending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                    {resent ? 'New link sent!' : 'Resend verification link'}
                  </button>
                </div>
              )}

              <p className="text-sm text-gray-400">
                Wrong email?{' '}
                <Link to="/get-started" className="font-semibold hover:underline" style={{ color: '#2EAF6F' }}>
                  Go back
                </Link>
              </p>
            </>
          )}
        </div>
      </AuthLayout>
    </>
  );
}
