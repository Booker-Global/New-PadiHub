import { useEffect, useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link } from 'react-router-dom';
import { FileText, AlertTriangle, ChevronRight } from 'lucide-react';
import { getValidSession } from '@/lib/session';
import { TermsAndConditions, getVisibleTermsSections, type TermsRegion } from '@/components/legal/TermsAndConditions';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/terms#webpage\",\"name\":\"Terms of Service — PadiHub\",\"url\":\"https://padihub.com/terms\",\"description\":\"PadiHub's Terms of Service — the rules and agreements that govern your use of the world's trusted Community Savings Infrastructure Platform.\",\"isPartOf\":{\"@id\":\"https://padihub.com/#website\"},\"about\":{\"@id\":\"https://padihub.com/#organization\"}}";

type GeoResponse = { region?: 'UK' | 'NG' | 'BOTH' };
type ProfileResponse = { success?: boolean; data?: { country?: string | null } };

function normalizeProfileCountry(country?: string | null): TermsRegion | null {
  if (country === 'NG') return 'NG';
  if (country === 'GB' || country === 'UK') return 'UK';
  return null;
}


export default function TermsPage() {
  const [region, setRegion] = useState<TermsRegion>('UK');

  useEffect(() => {
    let active = true;
    const session = getValidSession();

    const geoRequest = window.fetch('/api/geo')
      .then(response => response.ok ? response.json() as Promise<GeoResponse> : null)
      .catch(() => null);

    const profileRequest = session?.token
      ? window.fetch('/api/users/profile', { headers: { Authorization: 'Bearer ' + session.token } })
        .then(response => response.ok ? response.json() as Promise<ProfileResponse> : null)
        .catch(() => null)
      : Promise.resolve<ProfileResponse | null>(null);

    void Promise.all([geoRequest, profileRequest]).then(([geo, profile]) => {
      if (!active) return;
      const profileRegion = normalizeProfileCountry(profile?.data?.country);
      setRegion(profileRegion ?? (geo?.region === 'NG' ? 'NG' : 'UK'));
    });

    return () => {
      active = false;
    };
  }, []);

  const visibleSections = getVisibleTermsSections(region);

  return (
    <>
      <Helmet>
        <title>Terms of Service — PadiHub</title>
        <meta name="description" content="PadiHub's Terms of Service — the rules and agreements that govern your use of the world's trusted Community Savings Infrastructure Platform." />
        <link rel="canonical" href="https://padihub.com/terms" />
        <meta property="og:title" content="Terms of Service — PadiHub" />
        <meta property="og:description" content="The rules and agreements that govern your use of PadiHub." />
        <meta property="og:type" content="website" />
              <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />

        <script type="application/ld+json">{_jsonLd}</script>
</Helmet>

      {/* Hero */}
      <section className="relative overflow-hidden py-20" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-3xl opacity-10" style={{ background: '#F59E0B' }} />
        <div className="max-w-4xl mx-auto px-6 relative">
          <div>
            <h1 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap', border: 0 }}>Terms of Service — PadiHub</h1>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.25)' }}>
                <FileText size={22} style={{ color: '#F59E0B' }} />
              </div>
              <span className="text-sm font-bold uppercase tracking-widest" style={{ color: '#F59E0B' }}>Terms of Service</span>
            </div>
            <div style={{ fontSize: "clamp(1.75rem, 5vw, 3rem)", fontWeight: 800, color: "#fff", marginBottom: 16, fontFamily: 'Nunito, sans-serif' }}>
              Clear, fair terms for everyone
            </div>
            <div className="text-gray-300 text-lg leading-relaxed max-w-2xl mb-6">
              These terms govern your use of PadiHub. We've written them in plain language so you know exactly what to expect.
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-gray-400">
              <span>Last updated: 2 September 2026</span>
              <span>·</span>
              <span>Effective: 2 September 2026</span>
              <span>·</span>
              <span>Version 2.0</span>
            </div>
          </div>
        </div>
      </section>

      {/* Important notice */}
      <div className="bg-amber-50 border-b border-amber-100">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: '#F59E0B' }} />
            <p className="text-sm text-amber-800">
              <strong>Important:</strong> PadiHub is not a bank, financial institution, or payment processor. We provide community coordination tools only. All financial arrangements are between community members directly.
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <section style={{ padding: '64px 0', background: '#F9FAFB' }}>
        <div style={{ maxWidth: '80rem', margin: '0 auto', padding: '0 24px' }}>
          <div className="flex flex-col lg:flex-row gap-10">

            {/* Table of contents */}
            <aside className="hidden lg:flex lg:w-64 lg:flex-shrink-0">
              <div className="sticky top-24 rounded-3xl p-6 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                <h2 className="text-sm font-extrabold text-gray-900 mb-4 uppercase tracking-wider" style={{ fontFamily: 'Nunito, sans-serif' }}>Contents</h2>
                <nav className="flex flex-col gap-1">
                  {visibleSections.map(s => (
                    <a key={s.id} href={`#${s.id}`}
                      className="flex items-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors">
                      <ChevronRight size={12} />
                      {s.title}
                    </a>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 min-w-0">
              <TermsAndConditions region={region} />

              {/* Footer CTA */}
              <div
                className="mt-8 rounded-3xl p-6 text-center" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
                <p className="text-white font-bold mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>Questions about these terms?</p>
                <p className="text-gray-400 text-sm mb-4">Our team is happy to clarify anything. Reach us Mondays to Saturdays, 9am to 6pm at hello@padihub.com.</p>
                <div className="r-flex-center">
                  <Link to="/contact" className="px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                    Contact us
                  </Link>
                  <Link to="/privacy" className="px-6 py-3 rounded-2xl text-sm font-bold border border-white/20 text-white hover:bg-white/10 transition-all">
                    Read Privacy Policy
                  </Link>
                </div>
              </div>
            </main>
          </div>
        </div>
      </section>
    </>
  );
}
