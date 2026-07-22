import { Link } from 'react-router-dom';
import { ReactNode } from 'react';
import { Shield, Users, Award, TrendingUp } from 'lucide-react';

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  step?: number;
  totalSteps?: number;
}

const pillars = [
  { icon: Shield, label: 'Trust Score™', desc: 'Build your community reputation' },
  { icon: Users, label: 'Savings Groups', desc: 'Save together, grow together' },
  { icon: Award, label: 'Community Karma™', desc: 'Earn recognition for every action' },
  { icon: TrendingUp, label: 'Progress Tracking', desc: 'Celebrate every milestone' },
];

export default function AuthLayout({ children, title, subtitle, step, totalSteps }: AuthLayoutProps) {
  return (
    <>
      <style>{`
        .auth-shell {
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }
        .auth-brand-panel {
          display: none;
        }
        .auth-form-panel {
          width: 100%;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 40px 20px;
          background: #fff;
          overflow-y: auto;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        .auth-form-inner {
          max-width: 440px;
          width: 100%;
          margin: 0 auto;
        }
        .auth-mobile-logo {
          display: block;
          margin-bottom: 32px;
        }
        .auth-pillars-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (min-width: 1024px) {
          .auth-shell {
            flex-direction: row;
          }
          .auth-brand-panel {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            width: 50%;
            flex-shrink: 0;
            padding: 48px;
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #0F172A 0%, #1A1A2E 50%, #0D2818 100%);
          }
          .auth-form-panel {
            width: auto;
            flex: 1;
            padding: 40px 64px;
          }
          .auth-mobile-logo {
            display: none;
          }
        }
        @media (min-width: 640px) and (max-width: 1023px) {
          .auth-form-panel {
            padding: 40px 32px;
          }
        }
      `}</style>

      <div className="auth-shell">
        {/* Left panel — branding, desktop only */}
        <div className="auth-brand-panel">
          {/* Blobs */}
          <div style={{
            position: 'absolute', top: 80, left: 40,
            width: 256, height: 256, borderRadius: '50%',
            filter: 'blur(48px)', opacity: 0.2, background: '#2EAF6F', pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute', bottom: 80, right: 40,
            width: 256, height: 256, borderRadius: '50%',
            filter: 'blur(48px)', opacity: 0.1, background: '#F59E0B', pointerEvents: 'none'
          }} />

          <div style={{ position: 'relative' }}>
            <Link to="/">
              <img
                src="/airo-assets/images/logo/horizontal"
                alt="PadiHub"
                width="160" height="40"
                className="r-logo"
              />
            </Link>
          </div>

          <div style={{ position: 'relative' }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#2EAF6F', marginBottom: 12 }}>
              Community Operating System
            </p>
            <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: 16, lineHeight: 1.2, fontFamily: 'Nunito, sans-serif' }}>
              Save Together.<br />
              <span style={{ background: 'linear-gradient(135deg, #2EAF6F, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Grow Together.
              </span><br />
              Belong.
            </h2>
            <p style={{ color: '#9CA3AF', fontSize: 15, lineHeight: 1.6, marginBottom: 40, maxWidth: 360 }}>
              Join 10,000+ members building trust, saving smarter and celebrating every milestone together.
            </p>

            <div className="auth-pillars-grid">
              {pillars.map(({ icon: Icon, label, desc }) => (
                <div key={label} style={{
                  borderRadius: 16, padding: 16,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)'
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 12, background: 'rgba(46,175,111,0.2)'
                  }}>
                    <Icon size={18} style={{ color: '#2EAF6F' }} />
                  </div>
                  <p style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{label}</p>
                  <p style={{ color: '#9CA3AF', fontSize: 12 }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative' }}>
            <p style={{ color: '#4B5563', fontSize: 12 }}>
              Trust · Transparency · Community · Progress
            </p>
          </div>
        </div>

        {/* Right panel — form */}
        <div className="auth-form-panel">
          {/* Mobile logo */}
          <div className="auth-mobile-logo">
            <Link to="/">
              <img
                src="/airo-assets/images/logo/horizontal"
                alt="PadiHub"
                width="160" height="40"
                className="r-logo"
              />
            </Link>
          </div>

          {/* Progress bar */}
          {step && totalSteps && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF' }}>Step {step} of {totalSteps}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#2EAF6F' }}>{Math.round((step / totalSteps) * 100)}% complete</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: '#F3F4F6' }}>
                <div style={{
                  height: 6, borderRadius: 999,
                  width: `${(step / totalSteps) * 100}%`,
                  background: 'linear-gradient(90deg, #2EAF6F, #F59E0B)',
                  transition: 'width 0.5s ease'
                }} />
              </div>
            </div>
          )}

          <div className="auth-form-inner">
            <h1 style={{ fontSize: 'clamp(1.5rem, 5vw, 1.875rem)', fontWeight: 800, color: '#111827', marginBottom: 8, fontFamily: 'Nunito, sans-serif' }}>
              {title}
            </h1>
            <p style={{ color: '#6B7280', marginBottom: 32, fontSize: 15 }}>{subtitle}</p>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
