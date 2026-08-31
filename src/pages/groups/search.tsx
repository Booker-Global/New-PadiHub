import { Helmet } from '@dr.pogodin/react-helmet';
import GroupSearch from '@/components/GroupSearch';

const _jsonLd = "{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"@id\":\"https://padihub.com/groups/search#webpage\",\"name\":\"Find a Savings Group — PadiHub\",\"url\":\"https://padihub.com/groups/search\",\"description\":\"Search for rotating savings groups near you and request to join.\"}";

export default function FindGroupsPage() {
  return (
    <>
      <Helmet>
        <title>Find a Savings Group — PadiHub</title>
        <meta name="description" content="Search for rotating savings groups near you and request to join." />
        <link rel="canonical" href="https://padihub.com/groups/search" />
        <script type="application/ld+json">{_jsonLd}</script>
      </Helmet>

      <section style={{ padding: '6rem 0 5rem', background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <h1 style={{ color: '#fff', fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 'clamp(2rem, 4vw, 2.75rem)', marginBottom: '0.75rem' }}>
            Find a savings group
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '1.05rem' }}>
            Search for rotating savings groups open to new members in your location.
          </p>
        </div>
      </section>

      <section style={{ padding: '3rem 0 6rem' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '0 1.5rem' }}>
          <GroupSearch />
        </div>
      </section>
    </>
  );
}
