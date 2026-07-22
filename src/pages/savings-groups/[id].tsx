import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AnimatePresence } from 'motion/react';
import { MotionDiv, MotionProgressBar } from '@/lib/motion-safe';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft, PiggyBank, Users, Shield, Calendar, CheckCircle,
  Clock, TrendingUp, Share2, UserPlus, LogOut, Star, AlertTriangle
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const groupData: Record<string, {
  id: string; name: string; description: string;
  amount: string; freq: string; members: number; pct: number; nextDue: string;
  leader: string; status: string; color: string; role: string;
  startDate: string; rotation: string; stage: string; cycle: number; totalCycles: number;
  nextPayout: string; nextPayoutMember: string;
  maxMissed: number; gracePeriod: string; votingRequired: boolean; allowSwaps: boolean;
}> = {
  'monthly-ajo-pool': {
    id: 'monthly-ajo-pool', name: 'Monthly Ajo Pool',
    description: 'Monthly rotating savings pool. Each member receives the full pot once per cycle.',
    amount: '₦5,000', freq: 'Monthly', members: 10, pct: 64, nextDue: 'Jun 21',
    leader: 'Chidi N.', status: 'active', color: '#2EAF6F', role: 'Member',
    startDate: 'Jan 2026', rotation: 'Random', stage: 'Cycle 7 of 10', cycle: 7, totalCycles: 10,
    nextPayout: 'Jul 1', nextPayoutMember: 'Fatima H.',
    maxMissed: 2, gracePeriod: '48 hours', votingRequired: false, allowSwaps: true,
  },
  'emergency-fund': {
    id: 'emergency-fund', name: 'Emergency Fund',
    description: 'Shared emergency fund accessible to members facing unexpected hardship.',
    amount: '₦2,500', freq: 'Monthly', members: 8, pct: 90, nextDue: 'Jul 1',
    leader: 'Amara O.', status: 'active', color: '#F59E0B', role: 'Contributor',
    startDate: 'Feb 2026', rotation: 'Need-based', stage: 'Cycle 5 of 12', cycle: 5, totalCycles: 12,
    nextPayout: 'Jul 15', nextPayoutMember: 'Ngozi E.',
    maxMissed: 1, gracePeriod: '24 hours', votingRequired: true, allowSwaps: false,
  },
  'uk-deposit-fund': {
    id: 'uk-deposit-fund', name: 'UK Deposit Fund',
    description: 'Collective savings towards property deposits for first-time buyers.',
    amount: '£150', freq: 'Monthly', members: 12, pct: 42, nextDue: 'Jun 28',
    leader: 'Sarah K.', status: 'active', color: '#2eafaf', role: 'Member',
    startDate: 'Mar 2026', rotation: 'First come, first served', stage: 'Cycle 4 of 12', cycle: 4, totalCycles: 12,
    nextPayout: 'Jul 1', nextPayoutMember: 'James O.',
    maxMissed: 2, gracePeriod: '72 hours', votingRequired: true, allowSwaps: true,
  },
};

const defaultGroup = groupData['monthly-ajo-pool'];

const members = [
  { name: 'Chidi Nwosu',   initial: 'C', color: '#F59E0B', role: 'Leader',  trust: 92, paymentStatus: 'paid',    position: 1, verified: true },
  { name: 'Amara Okonkwo', initial: 'A', color: '#2EAF6F', role: 'Member',  trust: 85, paymentStatus: 'paid',    position: 2, verified: true },
  { name: 'Fatima Hassan', initial: 'F', color: '#2eafaf', role: 'Member',  trust: 88, paymentStatus: 'pending', position: 3, verified: true },
  { name: 'Emeka Sule',    initial: 'E', color: '#8B5CF6', role: 'Member',  trust: 90, paymentStatus: 'paid',    position: 4, verified: true },
  { name: 'Ngozi Adeyemi', initial: 'N', color: '#EF4444', role: 'Member',  trust: 76, paymentStatus: 'late',    position: 5, verified: false },
];

const activity = [
  { text: 'Amara O. made contribution',       date: 'Jun 18', color: '#2EAF6F', icon: CheckCircle },
  { text: 'Chidi N. made contribution',       date: 'Jun 17', color: '#2EAF6F', icon: CheckCircle },
  { text: 'Cycle 7 started',                  date: 'Jun 1',  color: '#F59E0B', icon: Star },
  { text: 'Fatima H. made contribution',      date: 'May 30', color: '#2EAF6F', icon: CheckCircle },
  { text: 'Reminder sent to all members',     date: 'May 20', color: '#2eafaf', icon: Clock },
];

type Tab = 'overview' | 'members' | 'activity' | 'rules';

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    paid:    { bg: 'rgba(46,175,111,0.1)',  color: '#2EAF6F', label: 'Paid' },
    pending: { bg: 'rgba(245,158,11,0.1)',  color: '#F59E0B', label: 'Pending' },
    late:    { bg: 'rgba(239,68,68,0.1)',   color: '#EF4444', label: 'Late' },
  };
  const s = map[status] ?? map.pending;
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: s.bg, color: s.color }}>{s.label}</span>;
}

export default function SavingsGroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const group = (id && groupData[id]) ? groupData[id] : defaultGroup;
  const [tab, setTab] = useState<Tab>('overview');

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview',  label: 'Overview' },
    { key: 'members',   label: 'Members' },
    { key: 'activity',  label: 'Activity' },
    { key: 'rules',     label: 'Rules' },
  ];

  const membersCompleted = Math.round(group.members * (group.pct / 100));

  return (
    <DashboardLayout>
      <Helmet>
        <title>{group.name} — PadiHub</title>
        <meta name="description" content={group.description} />
        <link rel="canonical" href={`https://padihub.com/savings-groups/${group.id}`} />
              <meta property="og:title" content="{group.name} — PadiHub" />
        <meta property="og:description" content="The trusted community savings platform. Save together, grow together and belong." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://padihub.com/savings-groups/[id]" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
</Helmet>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <MotionDiv initial="hidden" animate="visible" variants={stagger}>

          {/* Back */}
          <MotionDiv variants={fadeUp} className="mb-4">
            <Link to="/savings-groups" className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-400 hover:text-gray-700 transition-colors">
              <ChevronLeft size={16} /> Back to my groups
            </Link>
          </MotionDiv>

          {/* Hero card */}
          <MotionDiv variants={fadeUp} className="rounded-3xl p-6 mb-6 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #0F172A, #1A1A2E)' }}>
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-3xl opacity-20" style={{ background: group.color }} />
            <div className="relative">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-3xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)`, boxShadow: `0 4px 20px ${group.color}40` }}>
                    <PiggyBank size={24} color="#fff" />
                  </div>
                  <div>
                    <h1 className="text-xl font-extrabold text-white" style={{ fontFamily: 'Nunito, sans-serif' }}>{group.name}</h1>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>Led by {group.leader}</p>
                  </div>
                </div>
                <Link to={`/savings-groups/${group.id}/contribute`}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                  style={{ background: `linear-gradient(135deg, ${group.color}, ${group.color}cc)` }}>
                  <PiggyBank size={14} /> Make Payment
                </Link>
              </div>

              {/* Key stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Contribution', value: group.amount,             color: group.color },
                  { label: 'Frequency',    value: group.freq,               color: '#2eafaf' },
                  { label: 'Members',      value: group.members.toString(), color: '#8B5CF6' },
                  { label: 'Next due',     value: group.nextDue,            color: '#F59E0B' },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-lg font-black" style={{ color: k.color, fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>{k.label}</p>
                  </div>
                ))}
              </div>

              {/* Progress bar */}
              <div className="rounded-2xl p-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex justify-between text-xs mb-2">
                  <span style={{ color: 'rgba(255,255,255,0.5)' }}>{group.stage}</span>
                  <span className="font-bold" style={{ color: group.color }}>{group.pct}% complete</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                  <MotionProgressBar className="h-2 rounded-full" initial={{ width: 0 }} animate={{ width: `${group.pct}%` }}
                    transition={{ duration: 1, delay: 0.4, ease: 'easeOut' as const }}
                    style={{ background: `linear-gradient(90deg, ${group.color}, #F59E0B)` }} />
                </div>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mt-4 flex-wrap">
                {[
                  { label: 'Invite',  icon: UserPlus, to: '#' },
                  { label: 'Share',   icon: Share2,   to: '#' },
                  { label: 'Leave',   icon: LogOut,   to: `/savings-groups/${group.id}/leave` },
                ].map(a => (
                  <Link key={a.label} to={a.to}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:bg-white/10"
                    style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                    <a.icon size={12} /> {a.label}
                  </Link>
                ))}
              </div>
            </div>
          </MotionDiv>

          {/* Tabs */}
          <MotionDiv variants={fadeUp} className="flex gap-1 p-1 rounded-2xl mb-6" style={{ background: '#F3F4F6' }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: tab === t.key ? '#fff' : 'transparent',
                  color: tab === t.key ? '#1A1A2E' : '#6B7280',
                  boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                }}>
                {t.label}
              </button>
            ))}
          </MotionDiv>

          <AnimatePresence mode="wait">
            <MotionDiv key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}>

              {/* ── Overview ── */}
              {tab === 'overview' && (
                <div className="flex flex-col gap-5">
                  {/* Group info */}
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Group Details</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { label: 'Description',   value: group.description },
                        { label: 'Leader',         value: group.leader },
                        { label: 'Rotation order', value: group.rotation },
                        { label: 'Started',        value: group.startDate },
                      ].map(r => (
                        <div key={r.label} className="rounded-2xl p-3" style={{ background: '#F9FAFB' }}>
                          <p className="text-xs text-gray-400 mb-1">{r.label}</p>
                          <p className="text-sm font-semibold text-gray-800">{r.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment progress */}
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Payment Progress</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {[
                        { label: 'Cycle',              value: `${group.cycle} of ${group.totalCycles}`, color: group.color },
                        { label: 'Members paid',       value: `${membersCompleted} of ${group.members}`, color: '#2EAF6F' },
                        { label: 'Completion',         value: `${group.pct}%`,                           color: '#F59E0B' },
                      ].map(s => (
                        <div key={s.label} className="rounded-2xl p-4 text-center" style={{ background: '#F9FAFB' }}>
                          <p className="text-2xl font-black mb-0.5" style={{ color: s.color, fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
                          <p className="text-xs text-gray-400">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* Cycle dots */}
                    <div>
                      <p className="text-xs text-gray-400 mb-2">Rotation cycles</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {Array.from({ length: group.totalCycles }).map((_, i) => (
                          <div key={i} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{
                              background: i < group.cycle ? `linear-gradient(135deg, ${group.color}, ${group.color}cc)` : i === group.cycle ? `${group.color}20` : '#F3F4F6',
                              color: i < group.cycle ? '#fff' : i === group.cycle ? group.color : '#9CA3AF',
                              border: i === group.cycle ? `2px solid ${group.color}` : 'none',
                            }}>
                            {i < group.cycle ? <CheckCircle size={12} /> : i + 1}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Next payout */}
                  <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                    <h2 className="font-extrabold text-gray-900 mb-4" style={{ fontFamily: 'Nunito, sans-serif' }}>Next Payout</h2>
                    <div className="flex items-center gap-4 p-4 rounded-2xl" style={{ background: 'rgba(46,175,111,0.05)', border: '1px solid rgba(46,175,111,0.15)' }}>
                      <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white text-lg flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                        {group.nextPayoutMember[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900">{group.nextPayoutMember}</p>
                        <p className="text-xs text-gray-400">Expected payout date</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">{group.nextPayout}</p>
                        <div className="flex items-center gap-1 text-xs" style={{ color: '#2EAF6F' }}>
                          <Calendar size={11} /> Scheduled
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Members ── */}
              {tab === 'members' && (
                <div className="flex flex-col gap-3">
                  {members.map((m, i) => (
                    <div key={i} className="rounded-2xl p-4 bg-white flex items-center gap-4"
                      style={{ border: '1px solid #F3F4F6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                      <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0"
                        style={{ background: `linear-gradient(135deg, ${m.color}, ${m.color}cc)` }}>
                        {m.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 text-sm">{m.name}</p>
                          {m.verified && <CheckCircle size={13} style={{ color: '#2EAF6F' }} />}
                        </div>
                        <p className="text-xs text-gray-400">{m.role} · Position {m.position}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-1 text-xs text-gray-500">
                          <Shield size={11} style={{ color: '#2EAF6F' }} />
                          <span className="font-semibold">{m.trust}</span>
                        </div>
                        <PaymentBadge status={m.paymentStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Activity ── */}
              {tab === 'activity' && (
                <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent Activity</h2>
                  <div className="flex flex-col">
                    {activity.map((a, i) => (
                      <div key={i} className="flex items-start gap-4 relative">
                        {i < activity.length - 1 && (
                          <div className="absolute left-5 top-10 bottom-0 w-0.5" style={{ background: '#F3F4F6' }} />
                        )}
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 bg-white"
                          style={{ border: `2px solid ${a.color}30` }}>
                          <a.icon size={15} style={{ color: a.color }} />
                        </div>
                        <div className="flex-1 pb-5">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-gray-800">{a.text}</p>
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{a.date}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Rules ── */}
              {tab === 'rules' && (
                <div className="rounded-3xl p-5 bg-white" style={{ border: '1px solid #F3F4F6', boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
                  <h2 className="font-extrabold text-gray-900 mb-5" style={{ fontFamily: 'Nunito, sans-serif' }}>Group Rules</h2>
                  <div className="flex flex-col gap-4">
                    {[
                      {
                        icon: AlertTriangle, color: '#EF4444',
                        label: 'Maximum missed payments',
                        value: `${group.maxMissed} missed payment${group.maxMissed > 1 ? 's' : ''} before removal`,
                      },
                      {
                        icon: Clock, color: '#F59E0B',
                        label: 'Late payment grace period',
                        value: group.gracePeriod,
                      },
                      {
                        icon: Users, color: '#8B5CF6',
                        label: 'Voting required',
                        value: group.votingRequired ? 'Yes — members vote on key decisions' : 'No — leader makes decisions',
                      },
                      {
                        icon: TrendingUp, color: '#2EAF6F',
                        label: 'Payout swap requests',
                        value: group.allowSwaps ? 'Allowed — members can request position swaps' : 'Not allowed',
                      },
                    ].map((r, i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-2xl" style={{ background: '#F9FAFB' }}>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${r.color}15` }}>
                          <r.icon size={18} style={{ color: r.color }} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 mb-0.5">{r.label}</p>
                          <p className="text-sm font-semibold text-gray-800">{r.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </MotionDiv>
          </AnimatePresence>
        </MotionDiv>
      </div>
    </DashboardLayout>
  );
}
