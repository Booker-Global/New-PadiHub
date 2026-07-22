import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Eye, EyeOff, Lock, CheckCircle, XCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';

const rules = [
  { label: 'At least 8 characters',       test: (pw: string) => pw.length >= 8 },
  { label: 'One uppercase letter',         test: (pw: string) => /[A-Z]/.test(pw) },
  { label: 'One lowercase letter',         test: (pw: string) => /[a-z]/.test(pw) },
  { label: 'One number',                   test: (pw: string) => /[0-9]/.test(pw) },
  { label: 'One special character (!@#$)', test: (pw: string) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(pw) },
];

type Stage = 'form' | 'success' | 'expired';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPw, setShowPw]           = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [stage, setStage]             = useState<Stage>(token ? 'form' : 'expired');
  const [error, setError]             = useState('');

  const strength = rules.filter(r => r.test(password)).length;
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'][strength];
  const strengthColor = ['', '#EF4444', '#F59E0B', '#F59E0B', '#2EAF6F', '#2EAF6F'][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (strength < 4) { setError('Please choose a stronger password.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (!token) { setStage('expired'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setStage('success');
      } else if (res.status === 400 || res.status === 404) {
        // Token expired or invalid
        setStage('expired');
      } else {
        setError(json?.message ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'expired') {
    return (
      <>
        <Helmet>
          <title>Link Expired — PadiHub</title>
          <meta name="description" content="Your password reset link has expired. Request a new one." />
          <meta property="og:title" content="Link Expired — PadiHub" />
          <meta property="og:type" content="website" />
          <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
          <meta name="twitter:card" content="summary_large_image" />
        </Helmet>
        <h1 className="sr-only">Password reset link expired</h1>
        <AuthLayout title="Link expired" subtitle="This password reset link has expired or is invalid.">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <XCircle size={36} style={{ color: '#EF4444' }} />
            </div>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed">
              Password reset links expire after 1 hour for security. Please request a new link.
            </p>
            <Button asChild className="w-full rounded-2xl py-3.5 font-bold gap-2 mb-4"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
              <Link to="/forgot-password">Request new link <ArrowRight size={18} /></Link>
            </Button>
            <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors">
              <ArrowLeft size={14} /> Back to login
            </Link>
          </div>
        </AuthLayout>
      </>
    );
  }

  if (stage === 'success') {
    return (
      <>
        <Helmet>
          <title>Password Reset — PadiHub</title>
          <meta name="description" content="Your PadiHub password has been reset successfully." />
        </Helmet>
        <h1 className="sr-only">Password reset successful</h1>
        <AuthLayout title="Password updated! 🎉" subtitle="Your password has been reset successfully.">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{ background: 'rgba(46,175,111,0.1)' }}>
              <CheckCircle size={36} style={{ color: '#2EAF6F' }} />
            </div>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed">
              Your password has been updated. You can now log in with your new password.
            </p>
            <Button asChild className="w-full rounded-2xl py-3.5 font-bold gap-2"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
              <Link to="/login">Log in to PadiHub <ArrowRight size={18} /></Link>
            </Button>
          </div>
        </AuthLayout>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <title>Reset Password — PadiHub</title>
        <meta name="description" content="Create a new password for your PadiHub account." />
        <link rel="canonical" href="https://padihub.com/reset-password" />
      </Helmet>
      <h1 className="sr-only">Reset your PadiHub password</h1>
      <AuthLayout title="Create new password 🔐" subtitle="Choose a strong password to keep your account secure.">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && (
            <div className="rounded-2xl p-4 text-sm font-medium flex items-center gap-2"
              style={{ background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
              <XCircle size={15} /> {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">New password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Create a strong password"
                autoComplete="new-password"
                className="w-full pl-11 pr-12 py-3.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 transition-all"
                style={{ '--tw-ring-color': '#2EAF6F' } as React.CSSProperties}
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password.length > 0 && (
              <div className="mt-3">
                <div className="flex gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-300"
                      style={{ background: i <= strength ? strengthColor : '#E5E7EB' }} />
                  ))}
                </div>
                <p className="text-xs font-semibold" style={{ color: strengthColor }}>{strengthLabel}</p>
                <div className="mt-2 flex flex-col gap-1">
                  {rules.map(rule => {
                    const passed = rule.test(password);
                    return (
                      <div key={rule.label} className="flex items-center gap-2">
                        {passed
                          ? <CheckCircle size={13} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                          : <XCircle size={13} style={{ color: '#D1D5DB', flexShrink: 0 }} />
                        }
                        <span className="text-xs" style={{ color: passed ? '#2EAF6F' : '#9CA3AF' }}>{rule.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Confirm new password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password"
                autoComplete="new-password"
                className="w-full pl-11 pr-12 py-3.5 rounded-2xl border text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: confirm.length > 0 ? (confirm === password ? '#2EAF6F' : '#EF4444') : '#E5E7EB',
                  '--tw-ring-color': '#2EAF6F',
                } as React.CSSProperties}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirm.length > 0 && confirm !== password && (
              <p className="text-xs mt-1.5 font-medium" style={{ color: '#EF4444' }}>Passwords do not match</p>
            )}
            {confirm.length > 0 && confirm === password && (
              <p className="text-xs mt-1.5 font-medium flex items-center gap-1" style={{ color: '#2EAF6F' }}>
                <CheckCircle size={12} /> Passwords match
              </p>
            )}
          </div>

          <Button type="submit" disabled={loading || strength < 4 || password !== confirm}
            className="w-full rounded-2xl py-3.5 font-bold text-base gap-2 mt-2"
            style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 4px 20px rgba(46,175,111,0.3)' }}>
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Updating password...
              </span>
            ) : (
              <span className="flex items-center gap-2">Set new password <ArrowRight size={18} /></span>
            )}
          </Button>
        </form>

        <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors mt-6">
          <ArrowLeft size={14} /> Back to login
        </Link>
      </AuthLayout>
    </>
  );
}
