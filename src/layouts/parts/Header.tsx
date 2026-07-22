import { Link, useLocation } from 'react-router-dom';
import { Menu, X, LayoutDashboard, LogOut, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

// Auth state is always deferred — never read localStorage during SSR/first render.
// `isMounted` starts false so the first client render is identical to the SSR
// output (both see isLoggedIn=false). After hydration React fires the effect,
// isMounted flips true, and the real auth state is resolved. Without this gate
// the desktop CTA branch (logged-in vs logged-out buttons) differs between
// server and client for authenticated users, causing hydration error #418.
function useAuthUser() {
  const [user, setUser] = useState<{ isMounted: boolean; isLoggedIn: boolean; name: string }>({
    isMounted: false, isLoggedIn: false, name: '',
  });
  useEffect(() => {
    try {
      const raw = localStorage.getItem('padihub_user') || sessionStorage.getItem('padihub_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.name) {
          setUser({ isMounted: true, isLoggedIn: true, name: parsed.name });
          return;
        }
      }
    } catch { /* not logged in */ }
    setUser({ isMounted: true, isLoggedIn: false, name: '' });
  }, []);
  return user;
}

function handleLogout() {
  try {
    localStorage.removeItem('padihub_user');
    sessionStorage.removeItem('padihub_session');
  } catch { /* ignore */ }
  window.location.href = '/';
}

export default function Header() {
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const authUser = useAuthUser();

  const navItems = [
    { href: '/how-it-works', label: 'How it works' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/trust-security', label: 'Trust & Security' },
    { href: '/faq', label: 'FAQ' },
    { href: '/about', label: 'About' },
  ];

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isMobileMenuOpen]);

  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'linear-gradient(135deg, #0F172A 0%, #1A1A2E 50%, #0D2818 100%)' }}>
      <style>{`
        .hdr-logo {
          height: clamp(1.75rem, 5.5vw, 2.25rem);
          width: auto;
          max-width: min(42vw, 140px);
          object-fit: contain;
          display: block;
        }
        @media (min-width: 640px) {
          .hdr-logo { max-width: 160px; height: 2.25rem; }
        }
        .hdr-nav-link {
          font-size: clamp(0.8125rem, 0.75rem + 0.25vw, 0.875rem);
          font-weight: 500;
          transition: color 0.2s;
          text-decoration: none;
          white-space: nowrap;
        }
        .hdr-mobile-panel {
          position: fixed;
          inset: 0;
          z-index: 60;
          display: flex;
          flex-direction: column;
          padding: max(1rem, env(safe-area-inset-top)) max(1.25rem, env(safe-area-inset-right)) max(1.25rem, env(safe-area-inset-bottom)) max(1.25rem, env(safe-area-inset-left));
          background: linear-gradient(160deg, #0B1220 0%, #111827 55%, #0D2818 100%);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
        @media (min-width: 1024px) {
          .hdr-mobile-panel { display: none !important; }
        }
        .hdr-mobile-link {
          display: block;
          font-size: clamp(1.05rem, 0.95rem + 0.8vw, 1.2rem);
          font-weight: 500;
          padding: clamp(0.75rem, 2.2vw, 0.95rem) 0.25rem;
          color: #F3F4F6;
          text-decoration: none;
          line-height: 1.35;
        }
        .hdr-mobile-link[data-active="true"] { color: #34D399; }
        .hdr-mobile-cta {
          font-size: clamp(0.95rem, 0.9rem + 0.4vw, 1.05rem);
        }
        .hdr-terms {
          margin-top: auto;
          padding-top: 1.5rem;
          display: flex;
          align-items: center;
          gap: 0.65rem;
          text-decoration: none;
        }
        .hdr-terms span {
          font-size: clamp(0.7rem, 0.65rem + 0.3vw, 0.8rem);
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #F59E0B;
        }
      `}</style>
      <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 clamp(1rem, 3vw, 1.5rem)' }}>

        {/* ── Main bar ── */}
        <div style={{ display: 'flex', height: 'clamp(3.5rem, 10vw, 4rem)', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>

          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', flexShrink: 1, minWidth: 0 }} onClick={() => setIsMobileMenuOpen(false)}>
            <img
              src="/airo-assets/images/logo/horizontal"
              alt="PadiHub"
              width="160" height="40"
              className="hdr-logo"
            />
          </Link>

          <nav
            aria-label="Main navigation"
            className="hidden lg:flex items-center"
            style={{ gap: 'clamp(0.75rem, 1.5vw, 1.5rem)' }}
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className="hdr-nav-link"
                style={{ color: location.pathname === item.href ? '#34D399' : '#D1D5DB' }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center" style={{ gap: '0.75rem' }}>
            {authUser.isMounted && authUser.isLoggedIn ? (
              <>
                <Link to="/dashboard"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'clamp(0.8125rem, 0.75rem + 0.25vw, 0.875rem)', fontWeight: 600, color: '#D1D5DB', textDecoration: 'none' }}>
                  <LayoutDashboard size={15} /> Dashboard
                </Link>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', flexShrink: 0 }}>
                    {authUser.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 'clamp(0.8125rem, 0.75rem + 0.25vw, 0.875rem)', fontWeight: 600, color: '#D1D5DB' }}>{authUser.name.split(' ')[0]}</span>
                  <button onClick={handleLogout}
                    style={{ marginLeft: 4, padding: 6, borderRadius: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}
                    title="Log out">
                    <LogOut size={14} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <Link to="/login"
                  style={{ fontSize: 'clamp(0.8125rem, 0.75rem + 0.25vw, 0.875rem)', fontWeight: 500, color: '#D1D5DB', textDecoration: 'none' }}>
                  Log in
                </Link>
                <Button asChild size="sm" style={{ borderRadius: 999, padding: '0 clamp(1rem, 2vw, 1.5rem)', fontWeight: 700, fontSize: 'clamp(0.8125rem, 0.75rem + 0.25vw, 0.875rem)', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff', boxShadow: '0 0 20px rgba(46,175,111,0.4)', whiteSpace: 'nowrap' }}>
                  <Link to="/get-started">Get started free</Link>
                </Button>
              </>
            )}
          </div>

          <button
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            className="flex lg:hidden items-center justify-center"
            style={{
              padding: 8, background: 'none', border: 'none',
              cursor: 'pointer', color: '#F3F4F6', flexShrink: 0,
            }}
          >
            {isMobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Full-screen mobile menu */}
      {isMobileMenuOpen && (
        <div className="hdr-mobile-panel lg:hidden" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 'clamp(1.25rem, 4vw, 2rem)' }}>
            <Link to="/" onClick={() => setIsMobileMenuOpen(false)} style={{ minWidth: 0 }}>
              <img
                src="/airo-assets/images/logo/horizontal"
                alt="PadiHub"
                width="160" height="40"
                className="hdr-logo"
              />
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close menu"
              style={{ padding: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#F3F4F6', flexShrink: 0 }}
            >
              <X size={26} />
            </button>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }} aria-label="Mobile navigation">
            {navItems.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="hdr-mobile-link"
                data-active={location.pathname === item.href}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {authUser.isMounted && authUser.isLoggedIn ? (
              <>
                <Link to="/dashboard"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="hdr-mobile-link"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LayoutDashboard size={18} /> Dashboard
                </Link>
                <button onClick={() => { setIsMobileMenuOpen(false); handleLogout(); }}
                  className="hdr-mobile-link"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', color: '#F87171', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <LogOut size={18} /> Log out
                </button>
              </>
            ) : (
              <>
                <Link to="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="hdr-mobile-link hdr-mobile-cta">
                  Log in
                </Link>
                <Button asChild style={{ width: '100%', height: 'clamp(2.75rem, 8vw, 3.25rem)', borderRadius: 999, fontWeight: 700, fontSize: 'clamp(0.95rem, 0.9rem + 0.4vw, 1.05rem)', background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)', color: '#fff' }}>
                  <Link to="/get-started" onClick={() => setIsMobileMenuOpen(false)}>
                    Get started free
                  </Link>
                </Button>
              </>
            )}
          </div>

          <Link to="/terms" onClick={() => setIsMobileMenuOpen(false)} className="hdr-terms">
            <span style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(245,158,11,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B', flexShrink: 0 }}>
              <FileText size={16} />
            </span>
            <span>Terms of Service</span>
          </Link>
        </div>
      )}
    </header>
  );
}
