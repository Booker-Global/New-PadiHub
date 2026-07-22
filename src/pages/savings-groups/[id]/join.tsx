import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { MotionDiv } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, PiggyBank, Users, Shield, Calendar, CheckCircle, ArrowRight } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const groupData: Record<string, { name: string; community: string; amount: string; freq: string; members: number; pct: number; leader: string; trust: number; color: string; nextDue: string; rotation: string; purpose: string }> = {
  'tech-skills-fund':  { name: 'Tech Skills Fund',  community: 'Tech Professionals UK', amount: '£100',   freq: 'Monthly', members: 8,  pct: 35, leader: 'James O.', trust: 920, color: '#2EAF6F', nextDue: 'Jul 1',  rotation: 'Sequential', purpose: 'Saving for professional development and upskilling.' },
  'holiday-pool-2026': { name: 'Holiday Pool 2026', community: 'Family First Network',  amount: '£75',    freq: 'Monthly', members: 6,  pct: 20, leader: 'Sarah K.', trust: 880, color: '#F59E0B', nextDue: 'Jul 5',  rotation: 'Ballot',     purpose: 'Saving for a group holiday in 2026.' },
  'naija-growth-fund': { name: 'Naija Growth Fund', community: 'Naija Entrepreneurs',   amount: '₦3,000', freq: 'Monthly', members: 12, pct: 45, leader: 'Emeka S.', trust: 905, color: '#8B5CF6', nextDue: 'Jun 30', rotation: 'Need-based', purpose: 'Business growth fund for Nigerian entrepreneurs.' },
};
const defaultGroup = groupData['tech-skills-fund'];

export default function JoinSavingsGroupPage() {
  const { id } = useParams<{ id: string }>();
  const group = (id && groupData[id]) ? groupData[id] : defaultGroup;
  const groupId = id ?? 'tech-skills-fund';
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleJoin = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setSuccess(true); }, 1600);
  };

  if (success) return (
    <DashboardLayout>
      <div className="p-4 sm:p-6 max-w-lg mx-auto text-center py-16">
        <MotionDiv initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)`, boxShadow: `0 0 40px ${group.color}50` }}>
          <CheckCircle size={36} color="#fff" />
        </MotionDiv>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-2" style={{ fontFamily: 'Nunito, sans-serif' }}>You've joined! 🎉</h2>
        <p className="text-gray-500 mb-8">Welcome to <strong>{group.name}</strong>. Your first contribution is due <strong>{group.nextDue}</strong>.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to={`/savings-groups/${groupId}`} className="px-6 py-3 rounded-2xl font-bold text-white hover:opacity-90 transition-all"
            style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)` }}>
            View group
          </Link>
          <Link to="/savings-groups" className="px-6 py-3 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors text-center"
            style={{ border: '1px solid #E5E7EB' }}>
            All groups
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout>
      <Helmet>
        <title>Join {group.name} — PadiHub</title>
        <meta name="description" content={`Join ${group.name} savings group on PadiHub.`} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${groupId}/join`} />
              <meta property="og:title" content="Join {group.name} — PadiHub" />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://padihub.com/savings-groups/[id]/join" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-lg mx-auto">
        <div className="mb-5">
          <Link to="/savings-groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
            <ChevronLeft size={16} /> Back
          </Link>
        </div>

        {/* Banner */}
        <div className="rounded-3xl p-6 mb-5 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
          <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: group.color }} />
          <div className="relative flex items-center gap-4">
            <div className="w-14 h-14 rounded-3xl flex items-center justify-center flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)` }}>
              <PiggyBank size={24} color="#fff" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</h1>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{group.community}</p>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-3xl p-5 bg-white mb-5" style={{ border: '1px solid #E5E7EB' }}>
          <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Group details</h2>
          <p className="text-sm text-gray-600 mb-4 leading-relaxed">{group.purpose}</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Contribution', value: `${group.amount} ${group.freq}`, icon: PiggyBank, color: group.color },
              { label: 'Members',      value: `${group.members} active`,       icon: Users,    color: '#8B5CF6' },
              { label: 'Trust rating', value: group.trust.toString(),          icon: Shield,   color: '#2EAF6F' },
              { label: 'Next due',     value: group.nextDue,                   icon: Calendar, color: '#F59E0B' },
              { label: 'Leader',       value: group.leader,                    icon: Shield,   color: '#2eafaf' },
              { label: 'Rotation',     value: group.rotation,                  icon: ArrowRight,color: '#6B7280' },
            ].map(r => (
              <div key={r.label} className="rounded-xl p-3" style={{ background: '#F9FAFB' }}>
                <r.icon size={12} style={{ color: r.color, marginBottom: 4 }} />
                <p className="text-sm font-bold text-gray-900">{r.value}</p>
                <p className="text-xs text-gray-400">{r.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div className="rounded-2xl p-4 mb-5 bg-white" style={{ border: '1px solid #E5E7EB' }}>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Group progress</span>
            <span className="font-bold" style={{ color: group.color }}>{group.pct}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full" style={{ width: `${group.pct}%`, background: `linear-gradient(90deg, ${group.color}, #F59E0B)` }} />
          </div>
        </div>

        {/* Agreement */}
        <label className="flex items-start gap-3 cursor-pointer mb-5">
          <div className="relative mt-0.5">
            <input type="checkbox" className="sr-only" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
            <div className="w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all"
              style={{ borderColor: agreed ? group.color : '#D1D5DB', background: agreed ? group.color : '#fff' }}>
              {agreed && <CheckCircle size={12} color="#fff" />}
            </div>
          </div>
          <span className="text-sm text-gray-600 leading-relaxed">
            I agree to contribute <strong>{group.amount}</strong> {group.freq.toLowerCase()} and abide by the group rules.
          </span>
        </label>

        <div className="flex gap-3">
          <Link to="/savings-groups" className="px-5 py-3.5 rounded-2xl font-bold text-gray-600 hover:bg-gray-50 transition-colors"
            style={{ border: '1px solid #E5E7EB' }}>
            Cancel
          </Link>
          <button onClick={handleJoin} disabled={!agreed || loading}
            className="flex-1 py-3.5 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all"
            style={{ background: agreed ? `linear-gradient(135deg, ${group.color}, ${group.color}cc)` : '#D1D5DB', cursor: agreed ? 'pointer' : 'not-allowed' }}>
            {loading ? (
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              <><ArrowRight size={16} /> Join group</>
            )}
          </button>
        </div>
      </div>
    </DashboardLayout>
  );
}
