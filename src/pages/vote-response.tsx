import { useSearchParams, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AuthLayout from '@/components/AuthLayout';
import { getValidSession } from '@/lib/session';

/**
 * Landing page for the one-click accept/decline links sent in governance
 * vote emails (member admission, payout swap, contribution claim, member
 * removal). The backend (`GET /api/votes/respond`) performs the vote and
 * redirects here with the outcome in the query string — this page never
 * calls the API itself, it only displays the result the backend already
 * recorded, since the token is single-use.
 */
export default function VoteResponsePage() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') === 'error' ? 'error' : 'success';
  const message = searchParams.get('message') || (status === 'success'
    ? 'Your response has been recorded.'
    : 'This vote link is invalid or has expired.');

  const destination = getValidSession()?.token ? '/dashboard' : '/login';

  return (
    <>
      <Helmet>
        <title>Vote response — PadiHub</title>
        <meta name="description" content="Your response to a PadiHub group governance vote." />
      </Helmet>
      <h1 className="sr-only">PadiHub governance vote response</h1>

      <AuthLayout
        title={status === 'success' ? 'Response recorded!' : 'Something went wrong'}
        subtitle={message}
      >
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: status === 'success' ? 'rgba(46,175,111,0.1)' : 'rgba(239,68,68,0.1)' }}>
            {status === 'success'
              ? <CheckCircle size={40} style={{ color: '#2EAF6F' }} />
              : <XCircle size={40} style={{ color: '#DC2626' }} />}
          </div>
          <Link to={destination} className="w-full">
            <Button className="w-full">Go to your dashboard</Button>
          </Link>
        </div>
      </AuthLayout>
    </>
  );
}
