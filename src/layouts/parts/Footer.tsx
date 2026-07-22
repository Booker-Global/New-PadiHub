import { Link } from 'react-router-dom';
import { Shield, Users, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';

function TwitterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
function InstagramIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}
function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

export default function Footer() {
  // Hardcode the year to avoid SSR/client mismatch near year boundaries.
  // Update manually each January or derive safely post-hydration.
  const [currentYear, setCurrentYear] = useState(2026);
  useEffect(() => { setCurrentYear(new Date().getFullYear()); }, []);

  const socialLinks = [
    { icon: TwitterIcon,   href: 'https://twitter.com/padihub',              label: 'Twitter / X' },
    { icon: InstagramIcon, href: 'https://instagram.com/padihub',            label: 'Instagram' },
    { icon: LinkedInIcon,  href: 'https://linkedin.com/company/padihub',     label: 'LinkedIn' },
    { icon: FacebookIcon,  href: 'https://facebook.com/padihub',             label: 'Facebook' },
  ];

  return (
    <footer style={{ background: '#0A0F1A', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <style>{`
        .ftr-inner {
          max-width: 80rem;
          margin: 0 auto;
          padding: 64px 20px;
          box-sizing: border-box;
        }
        .ftr-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 40px;
          margin-bottom: 48px;
        }
        .ftr-link-col nav {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .ftr-link-col a {
          display: block;
          font-size: 14px;
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          white-space: nowrap;
        }
        .ftr-link-col a:hover { color: #fff; }
        .ftr-col-head {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #2EAF6F;
          margin-bottom: 20px;
        }
        .ftr-badges {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
        }
        .ftr-socials {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ftr-social-btn {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.5);
          text-decoration: none;
          transition: background 0.2s;
          flex-shrink: 0;
        }
        .ftr-social-btn:hover { background: rgba(46,175,111,0.2); }
        .ftr-bottom {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          padding-top: 32px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        @media (min-width: 640px) {
          .ftr-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (min-width: 900px) {
          .ftr-grid {
            grid-template-columns: 2fr 1fr 1fr 1fr;
          }
          .ftr-bottom {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }
      `}</style>

      <div className="ftr-inner">
        <div className="ftr-grid">

          {/* Brand */}
          <div>
            <div style={{ marginBottom: 16 }}>
              <img src="/airo-assets/images/logo/horizontal" alt="PadiHub"
                width="160" height="40"
                className="r-logo" />
            </div>
            <p style={{ fontSize: 'clamp(0.8125rem, 0.78rem + 0.25vw, 0.875rem)', lineHeight: 1.6, maxWidth: 280, marginBottom: 20, color: 'rgba(255,255,255,0.5)' }}>
              The world's first Community Operating System for savings. Save together. Grow together. Belong.
            </p>
            <div className="ftr-badges">
              {[
                { icon: Shield, label: 'Trust Score™' },
                { icon: Users,  label: 'Community' },
                { icon: Globe,  label: 'UK & Nigeria' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  <Icon size={12} style={{ color: '#2EAF6F', flexShrink: 0 }} />
                  {label}
                </div>
              ))}
            </div>
            <div className="ftr-socials">
              {socialLinks.map(({ icon: Icon, href, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer"
                  aria-label={label} className="ftr-social-btn">
                  <Icon />
                </a>
              ))}
            </div>
          </div>

          {/* Product */}
          <div className="ftr-link-col">
            <p className="ftr-col-head">Product</p>
            <nav aria-label="Footer product links">
              {[
                { to: '/features',       label: 'Features' },
                { to: '/how-it-works',   label: 'How it works' },
                { to: '/pricing',        label: 'Pricing' },
                { to: '/trust-security', label: 'Trust & Security' },
              ].map(({ to, label }) => (
                <Link key={to} to={to}>{label}</Link>
              ))}
            </nav>
          </div>

          {/* Community */}
          <div className="ftr-link-col">
            <p className="ftr-col-head">Community</p>
            <nav aria-label="Footer community links">
              {[
                { to: '/trust',          label: 'Trust Score™' },
                { to: '/savings-groups', label: 'Savings Groups' },
              ].map(({ to, label }) => (
                <Link key={to} to={to}>{label}</Link>
              ))}
            </nav>
          </div>

          {/* Support */}
          <div className="ftr-link-col">
            <p className="ftr-col-head">Support</p>
            <nav aria-label="Footer support links">
              {[
                { to: '/help',    label: 'Help Centre' },
                { to: '/about',   label: 'About' },
                { to: '/contact', label: 'Contact' },
                { to: '/faq',     label: 'FAQ' },
                { to: '/privacy', label: 'Privacy Policy' },
                { to: '/terms',   label: 'Terms of Service' },
              ].map(({ to, label }) => (
                <Link key={to} to={to}>{label}</Link>
              ))}
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="ftr-bottom">
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, maxWidth: '100%' }}>
            © {currentYear} PadiHub. All rights reserved.
            <span className="hidden sm:inline"> · Trust · Transparency · Community · Progress</span>
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', lineHeight: 1.5 }}>
            Not a bank. Not a wallet. A Community Operating System.
          </p>
        </div>
      </div>
    </footer>
  );
}
