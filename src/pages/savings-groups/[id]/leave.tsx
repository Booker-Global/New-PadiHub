import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, PiggyBank, Shield, AlertTriangle, CheckCircle } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const groupNames: Record<string, { name: string; community: string; color: string; amount: string; freq: string }> = {
  'monthly-ajo-pool': { name: 'Monthly Ajo Pool',    community: 'Lagos Savers Circle', color: '#2EAF6F', amount: '₦5,000', freq: 'Monthly' },
  'emergency-fund':   { name: 'Emergency Fund',      community: 'Lagos Savers Circle', color: '#F59E0B', amount: '₦2,500', freq: 'Monthly' },
  'uk-deposit-fund':  { name: 'UK Deposit Fund',     community: 'UK Homeowners Hub',   color: '#2eafaf', amount: '£150',   freq: 'Monthly' },
  'business-capital': { name: 'Business Capital Pool',community: 'Diaspora Builders',  color: '#8B5CF6', amount: '£200',   freq: 'Monthly' },
};
const defaultGroup = groupNames['monthly-ajo-pool'];

export default function LeaveSavingsGroupPage() {
  const { id } = useParams<{ id: string }>();
  const group = (id && groupNames[id]) ? groupNames[id] : defaultGroup;
  const groupId = id ?? 'monthly-ajo-pool';
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState(false);

  const handleLeave = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setLeft(true); }, 1400);
  };

  if (left) return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#F3F4F6' }}>
          <CheckCircle size={28} style={{ color: '#2EAF6F' }} />
        </div>
        <h2 className="text-xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>You've left the group</h2>
        <p className="text-gray-500 mb-2">Your contribution history remains part of your <strong>PadiHub Passport™</strong>.</p>
        <p className="text-sm text-gray-400 mb-8">Your Trust Score™ and Community Karma™ are preserved.</p>
        <Link to="/savings-groups" className="px-6 py-3 rounded-2xl font-bold text-white inline-block hover:opacity-90 transition-all"
          style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
          Back to savings groups
        </Link>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <Helmet>
        <title>Leave {group.name} — PadiHub</title>
        <meta name="description" content={`Leave ${group.name} savings group on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${groupId}/leave`} />
              <meta property="og:title" content="Leave {group.name} — PadiHub" />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://padihub.com/savings-groups/[id]/leave" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <div className="mb-5">
          <Link to={`/savings-groups/${groupId}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
        </div>

        <MotionDiv initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* Warning icon */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <AlertTriangle size={28} style={{ color: '#EF4444' }} />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>
              Leave this Savings Group?
            </h1>
            <p className="text-gray-500">
              You're about to leave <strong>{group.name}</strong>.
            </p>
          </div>

          {/* Group card */}
          <div className="rounded-3xl p-5 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-20" style={{ background: group.color }} />
            <div className="relative flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)` }}>
                <PiggyBank size={18} color="#fff" />
              </div>
              <div>
                <p className="font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</p>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{group.community} · {group.amount} {group.freq}</p>
              </div>
            </div>
          </div>

          {/* What stays */}
          <div className="rounded-3xl p-5 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
            <h2 className="font-extrabold text-gray-900 mb-3" style={{ fontFamily: 'Nunito, sans-serif' }}>What stays with you</h2>
            <div className="flex flex-col gap-2">
              {[
                { text: 'Your full contribution history is preserved in your Passport™', icon: Shield, color: '#2EAF6F' },
                { text: 'Your Trust Score™ reflects all contributions made', icon: Shield, color: '#2EAF6F' },
                { text: 'Your Community Karma™ earned remains on your profile', icon: CheckCircle, color: '#F59E0B' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: 'rgba(46,175,111,0.05)' }}>
                  <item.icon size={15} style={{ color: item.color, flexShrink: 0, marginTop: 1 }} />
                  <p className="text-sm text-gray-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-2xl p-4 mb-5 flex items-start gap-3" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <AlertTriangle size={15} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
            <p className="text-sm text-gray-600">
              Leaving mid-cycle may affect your community standing. Please notify your group leader before leaving.
            </p>
          </div>

          {/* Confirm checkbox */}
          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <div className="relative mt-0.5">
              <input type="checkbox" className="sr-only" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
              <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
                style={{ borderColor: confirmed ? '#EF4444' : '#D1D5DB', background: confirmed ? '#EF4444' : '#fff' }}>
                {confirmed && <CheckCircle size={12} color="#fff" />}
              </div>
            </div>
            <span className="text-sm text-gray-600">I understand the impact of leaving this savings group.</span>
          </label>

          <div className="flex gap-3">
            <Link to={`/savings-groups/${groupId}`}
              className="flex-1 py-3.5 rounded-2xl font-bold text-center transition-all hover:opacity-90 text-white"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              Stay in group
            </Link>
            <button onClick={handleLeave} disabled={!confirmed || loading}
              className="flex-1 py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
              style={{
                background: confirmed ? 'rgba(239,68,68,0.1)' : '#F3F4F6',
                color: confirmed ? '#EF4444' : '#9CA3AF',
                border: confirmed ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent',
                cursor: confirmed ? 'pointer' : 'not-allowed',
              }}>
              {loading ? (
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(239,68,68,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : 'Leave group'}
            </button>
          </div>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
