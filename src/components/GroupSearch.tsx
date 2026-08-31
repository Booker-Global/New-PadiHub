import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Users, MapPin, CheckCircle, AlertTriangle } from 'lucide-react';
import { getValidSession } from '@/lib/session';

interface SearchGroup {
  id: string;
  name: string;
  description?: string | null;
  country: 'GB' | 'NG';
  currency: 'GBP' | 'NGN';
  contribution_amount: string | number;
  contribution_frequency: 'daily' | 'weekly' | 'monthly';
  maximum_members: number;
  member_count: number;
  spots_remaining: number;
  min_trust_score: number;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  code?: string;
  errors?: Record<string, string[] | undefined>;
}

function getErrorMessage<T>(json: ApiResponse<T> | null, fallback: string) {
  const firstFieldError = json?.errors
    ? Object.values(json.errors).flat().find((value): value is string => Boolean(value))
    : undefined;
  return firstFieldError || json?.message || fallback;
}

function formatAmount(amount: string | number, currency: 'GBP' | 'NGN') {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return `${amount}`;
  return currency === 'NGN' ? `₦${value.toLocaleString('en-NG')}` : `£${value.toFixed(2)}`;
}

/**
 * Resolves the visitor's location so group search only ever shows groups in
 * their own country ("Users should only be able to see groups in their
 * location (UK or Nigeria) when searching"). Logged-in members use their own
 * profile country; guests fall back to IP-based /api/geo detection.
 */
function useSearchCountry() {
  const [country, setCountry] = useState<'GB' | 'NG'>('GB');
  useEffect(() => {
    let cancelled = false;
    const session = getValidSession();

    async function resolve() {
      if (session?.token) {
        try {
          const response = await window.fetch('/api/users/profile', {
            headers: { Authorization: 'Bearer ' + session.token },
          });
          const json = await response.json().catch(() => null) as ApiResponse<{ country?: 'GB' | 'NG' }> | null;
          if (!cancelled && response.ok && (json?.data?.country === 'GB' || json?.data?.country === 'NG')) {
            setCountry(json.data.country);
            return;
          }
        } catch { /* fall through to IP-based lookup */ }
      }

      try {
        const response = await window.fetch('/api/geo');
        const json = await response.json().catch(() => null) as { region?: 'UK' | 'NG' | 'BOTH' } | null;
        if (!cancelled && json?.region === 'NG') setCountry('NG');
        else if (!cancelled) setCountry('GB');
      } catch {
        if (!cancelled) setCountry('GB');
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, []);
  return country;
}

/**
 * Shared "search for available savings groups" widget — embedded on the
 * homepage, on a standalone /groups/search page (linked from the footer's
 * "Savings Groups" link), and reachable from the member's Profile page.
 */
export default function GroupSearch({ compact = false }: { compact?: boolean }) {
  const country = useSearchCountry();
  const isLoggedIn = useMemo(() => Boolean(getValidSession()?.token), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState<Record<string, string>>({});
  const [joinError, setJoinError] = useState<Record<string, string>>({});

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new window.URLSearchParams({ country });
      if (query.trim()) params.set('query', query.trim());
      const response = await window.fetch(`/api/groups/search?${params.toString()}`);
      const json = await response.json().catch(() => null) as ApiResponse<SearchGroup[]> | null;
      if (!response.ok) {
        setError(getErrorMessage(json, 'Could not search for groups right now.'));
        setResults([]);
        return;
      }
      setResults(Array.isArray(json?.data) ? json!.data! : []);
    } catch {
      setError('Network error. Please check your connection and try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [country, query]);

  useEffect(() => {
    void runSearch();
    // Re-run whenever the resolved country changes; query changes are
    // user-triggered via the search button/Enter key, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const handleRequestToJoin = async (groupId: string) => {
    const session = getValidSession();
    if (!session?.token) {
      window.location.href = `/get-started?next=${encodeURIComponent('/groups/search')}`;
      return;
    }

    setJoiningId(groupId);
    setJoinError(current => ({ ...current, [groupId]: '' }));
    setJoinNotice(current => ({ ...current, [groupId]: '' }));

    try {
      const response = await window.fetch('/api/memberships', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: groupId }),
      });
      const json = await response.json().catch(() => null) as ApiResponse<{ status?: string; message?: string }> | null;
      if (!response.ok) {
        setJoinError(current => ({ ...current, [groupId]: getErrorMessage(json, 'Could not request to join this group.') }));
        return;
      }
      setJoinNotice(current => ({ ...current, [groupId]: json?.data?.message || json?.message || 'Request submitted.' }));
    } catch {
      setJoinError(current => ({ ...current, [groupId]: 'Network error. Please check your connection and try again.' }));
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl border border-gray-200 bg-white">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void runSearch(); }}
            placeholder="Search groups by name…"
            className="flex-1 bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none min-w-0"
          />
        </div>
        <button
          onClick={() => void runSearch()}
          disabled={loading}
          className="px-5 py-3 rounded-2xl font-bold text-white text-sm flex-shrink-0"
          style={{ background: loading ? '#D1D5DB' : 'linear-gradient(135deg, #2EAF6F, #1d8a55)', cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1 mb-4">
        <MapPin size={12} /> Showing groups in {country === 'NG' ? 'Nigeria' : 'the United Kingdom'}
      </p>

      {error && (
        <div className="rounded-2xl p-3 text-sm font-semibold flex items-center gap-2 mb-4" style={{ background: 'rgba(239,68,68,0.08)', color: '#B91C1C', border: '1px solid rgba(239,68,68,0.2)' }}>
          <AlertTriangle size={15} /> {error}
        </div>
      )}

      {!error && results && results.length === 0 && (
        <div className="rounded-2xl p-6 text-center" style={{ background: '#F9FAFB', border: '1px solid #F3F4F6' }}>
          <Users size={22} className="mx-auto mb-2" style={{ color: '#9CA3AF' }} />
          <p className="text-sm text-gray-500">No groups with open spots found. Try a different search or check back soon.</p>
        </div>
      )}

      <div className={compact ? 'flex flex-col gap-3 max-h-80 overflow-y-auto' : 'grid sm:grid-cols-2 gap-4'}>
        {(results || []).map(group => (
          <div key={group.id} className="rounded-2xl p-4 bg-white flex flex-col gap-2" style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-bold text-gray-900 text-sm">{group.name}</p>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0" style={{ background: 'rgba(46,175,111,0.1)', color: '#2EAF6F' }}>
                {group.spots_remaining} spot{group.spots_remaining === 1 ? '' : 's'} left
              </span>
            </div>
            {group.description && <p className="text-xs text-gray-500 line-clamp-2">{group.description}</p>}
            <p className="text-xs text-gray-400">
              {formatAmount(group.contribution_amount, group.currency)} · {group.contribution_frequency} · {group.member_count}/{group.maximum_members} members
              {group.min_trust_score > 0 ? ` · Min. Trust Score ${group.min_trust_score}` : ''}
            </p>

            {joinNotice[group.id] ? (
              <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: '#2EAF6F' }}>
                <CheckCircle size={13} /> {joinNotice[group.id]}
              </p>
            ) : (
              <button
                onClick={() => void handleRequestToJoin(group.id)}
                disabled={joiningId === group.id}
                className="mt-1 px-4 py-2 rounded-xl text-xs font-bold text-white self-start"
                style={{ background: joiningId === group.id ? '#D1D5DB' : 'linear-gradient(135deg, #2EAF6F, #1d8a55)', cursor: joiningId === group.id ? 'not-allowed' : 'pointer' }}
              >
                {joiningId === group.id ? 'Requesting…' : 'Request to join'}
              </button>
            )}
            {joinError[group.id] && (
              <p className="text-xs font-semibold" style={{ color: '#B91C1C' }}>{joinError[group.id]}</p>
            )}
          </div>
        ))}
      </div>

      {!isLoggedIn && (
        <p className="text-xs text-gray-400 mt-4">
          Not signed up yet? <Link to="/get-started" className="font-bold underline" style={{ color: '#2EAF6F' }}>Create an account</Link> to request to join a group.
        </p>
      )}
    </div>
  );
}
