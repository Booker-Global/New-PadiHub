import { Helmet } from '@dr.pogodin/react-helmet';
import { useState } from 'react';
import { MotionDiv, MotionProgressBar } from '@/lib/motion-safe';
import { Link } from 'react-router-dom';
import {
  Crown, Users, PiggyBank, Vote, AlertTriangle,
  ChevronRight, Shield, Bell,
  ArrowUpRight, BarChart2, Star, Activity
} from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';
import { ProgressRing } from '@/components/ui/progress-ring';

const fadeUp = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.07 } } };

const communities = [
  { name: 'Lagos Savers Circle',  members: 15, health: 95, contributions: 94, karma: 2340, trust: 920, color: '#2EAF6F', initial: 'L', pending: 2, proposals: 1 },
  { name: 'Family First Network', members: 19, health: 82, contributions: 78, karma: 1890, trust: 847, color: '#F59E0B', initial: 'F', pending: 4, proposals: 2 },
  { name: 'Diaspora Builders',    members: 28, health: 88, contributions: 91, karma: 3100, trust: 905, color: '#8B5CF6', initial: 'D', pending: 1, proposals: 0 },
];

const urgentActions = [
  { type: 'missed',    label: 'Amara O. missed June contribution',       community: 'Lagos Savers Circle',  urgency: 'high',   time: '2h ago',  icon: AlertTriangle, color: '#EF4444' },
  { type: 'proposal',  label: 'New proposal: Increase monthly target',   community: 'Family First Network', urgency: 'medium', time: '5h ago',  icon: Vote,          color: '#F59E0B' },
  { type: 'join',      label: 'New join request from Tunde B.',          community: 'Lagos Savers Circle',  urgency: 'low',    time: '1d ago',  icon: Users,         color: '#2EAF6F' },
  { type: 'missed',    label: 'Chidi N. missed June contribution',       community: 'Family First Network', urgency: 'high',   time: '1d ago',  icon: AlertTriangle, color: '#EF4444' },
  { type: 'milestone', label: 'Diaspora Builders hit £10,000 milestone', community: 'Diaspora Builders',    urgency: 'info',   time: '2d ago',  icon: Star,          color: '#8B5CF6' },
];

const kpis = [
  { label: 'Communities Led',     value: '3',    sub: '+1 this year',   icon: Crown,     color: '#F59E0B', ring: 75 },
  { label: 'Total Members',       value: '62',   sub: '+8 this month',  icon: Users,     color: '#2EAF6F', ring: 62 },
  { label: 'Avg Health Score',    value: '88%',  sub: '+3% vs last mo', icon: Activity,  color: '#8B5CF6', ring: 88 },
  { label: 'Contribution Rate',   value: '88%',  sub: '55 of 62 on time',icon: PiggyBank, color: '#2eafaf', ring: 88 },
  { label: 'Open Proposals',      value: '3',    sub: '2 need your vote',icon: Vote,      color: '#F59E0B', ring: 30 },
  { label: 'Pending Actions',     value: '7',    sub: '3 urgent',       icon: Bell,      color: '#EF4444', ring: 70 },
];

const recentActivity = [
  { label: 'Fatima A. contributed to Lagos Savers',    time: '1h ago',  color: '#2EAF6F', icon: PiggyBank },
  { label: 'Governance vote closed — 8/10 voted',      time: '3h ago',  color: '#8B5CF6', icon: Vote },
  { label: 'New member Yemi O. joined Diaspora Builders', time: '6h ago', color: '#F59E0B', icon: Users },
  { label: 'Community health report generated',         time: '1d ago',  color: '#2eafaf', icon: BarChart2 },
  { label: 'Trust Score™ update: +12 for Tunde B.',    time: '2d ago',  color: '#2EAF6F', icon: Shield },
];

export default function LeaderCommandCentrePage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'actions' | 'activity'>('overview');

  return (
    <DashboardLayout>
      <Helmet>
        <title>Leader Command Centre — PadiHub</title>
        <meta name="description" content="Manage your communities, track member contributions and lead with confidence." />
        <link rel="canonical" href="https://www.padihub.com/leader" />
              <meta property="og:title" content="Leader Command Centre — PadiHub" />
        <meta property="og:description" content="Manage your communities, track member contributions and lead with confidence." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://padihub.com/airo-assets/images/og/default" />
        <meta name="robots" content="noindex,nofollow" />
</Helmet>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #F59E0B, #d97706)' }}>
                <Crown size={16} color="#fff" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#F59E0B20', color: '#F59E0B' }}>Leader Command Centre</span>
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Your Communities</h1>
            <p className="text-sm text-gray-500 mt-0.5">Leading 3 communities · 62 members · 7 pending actions</p>
          </div>
          <div className="flex gap-3">
            <Link to="/leader/contributions"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border transition-all hover:bg-gray-50"
              style={{ borderColor: '#E5E7EB', color: '#374151' }}>
              <BarChart2 size={15} /> Contributions
            </Link>
            <Link to="/savings-groups/create"
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white transition-all hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
              <Crown size={15} /> New Group
            </Link>
          </div>
        </MotionDiv>

        {/* KPI Grid */}
        <MotionDiv variants={stagger} initial="hidden" animate="visible"
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {kpis.map((k, i) => (
            <MotionDiv key={i} variants={fadeUp}
              className="bg-white rounded-3xl p-4 flex flex-col items-center text-center shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <ProgressRing value={k.ring} size={52} strokeWidth={4} color={k.color}>
                <k.icon size={16} style={{ color: k.color }} />
              </ProgressRing>
              <p className="text-lg font-extrabold text-gray-900 mt-2" style={{ fontFamily: 'Nunito, sans-serif' }}>{k.value}</p>
              <p className="text-xs font-semibold text-gray-500">{k.label}</p>
              <p className="text-xs mt-0.5" style={{ color: k.color }}>{k.sub}</p>
            </MotionDiv>
          ))}
        </MotionDiv>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-2xl bg-gray-100 w-fit">
          {(['overview', 'actions', 'activity'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="px-5 py-2 rounded-xl text-sm font-bold capitalize transition-all"
              style={{ background: activeTab === t ? '#fff' : 'transparent', color: activeTab === t ? '#111827' : '#6B7280', boxShadow: activeTab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
              {t === 'actions' ? `Actions (${urgentActions.length})` : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-4">
            <h2 className="text-base font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Community Overview</h2>
            {communities.map((c, i) => (
              <MotionDiv key={i} variants={fadeUp}
                className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-lg flex-shrink-0"
                      style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)` }}>{c.initial}</div>
                    <div>
                      <p className="font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>{c.name}</p>
                      <p className="text-xs text-gray-400">{c.members} members · {c.pending} pending · {c.proposals} proposals</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 sm:gap-6">
                    {[
                      { label: 'Health', value: `${c.health}%`, color: c.health >= 90 ? '#2EAF6F' : c.health >= 75 ? '#F59E0B' : '#EF4444' },
                      { label: 'Contributions', value: `${c.contributions}%`, color: '#2eafaf' },
                      { label: 'Trust Avg', value: c.trust, color: '#8B5CF6' },
                    ].map(s => (
                      <div key={s.label} className="text-center">
                        <p className="text-base font-extrabold" style={{ color: s.color, fontFamily: 'Nunito, sans-serif' }}>{s.value}</p>
                        <p className="text-xs text-gray-400">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link to={`/leader/community-health`}
                      className="p-2 rounded-xl transition-all hover:bg-gray-50" style={{ color: '#6B7280' }}>
                      <BarChart2 size={16} />
                    </Link>
                    <Link to={`/leader/members`}
                      className="p-2 rounded-xl transition-all hover:bg-gray-50" style={{ color: '#6B7280' }}>
                      <Users size={16} />
                    </Link>
                    <Link to={`/savings-groups`}
                      className="p-2 rounded-xl transition-all hover:bg-gray-50" style={{ color: '#6B7280' }}>
                      <ChevronRight size={16} />
                    </Link>
                  </div>
                </div>
                {/* Health bar */}
                <div className="mt-4 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <MotionProgressBar className="h-full rounded-full" style={{ background: c.health >= 90 ? '#2EAF6F' : c.health >= 75 ? '#F59E0B' : '#EF4444' }}
                    initial={{ width: 0 }} animate={{ width: `${c.health}%` }} transition={{ duration: 0.8, delay: i * 0.1 }} />
                </div>
              </MotionDiv>
            ))}

            {/* Quick Links */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {[
                { label: 'Member Management', icon: Users,     color: '#2EAF6F', to: '/leader/members' },
                { label: 'Contributions',     icon: PiggyBank, color: '#2eafaf', to: '/leader/contributions' },
                { label: 'Savings Groups',    icon: PiggyBank, color: '#8B5CF6', to: '/savings-groups' },
                { label: 'Trust Score™',      icon: Vote,      color: '#F59E0B', to: '/trust' },
              ].map((item, i) => (
                <Link key={i} to={item.to}
                  className="bg-white rounded-2xl p-4 flex flex-col items-center gap-2 text-center shadow-sm border border-gray-100 hover:shadow-md transition-all group">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                    style={{ background: `${item.color}15` }}>
                    <item.icon size={18} style={{ color: item.color }} />
                  </div>
                  <p className="text-xs font-bold text-gray-700">{item.label}</p>
                </Link>
              ))}
            </div>
          </MotionDiv>
        )}

        {/* Actions Tab */}
        {activeTab === 'actions' && (
          <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Pending Actions</h2>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#FEF2F2', color: '#EF4444' }}>3 urgent</span>
            </div>
            {urgentActions.map((a, i) => (
              <MotionDiv key={i} variants={fadeUp}
                className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${a.color}15` }}>
                  <a.icon size={18} style={{ color: a.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{a.label}</p>
                  <p className="text-xs text-gray-400">{a.community} · {a.time}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full capitalize"
                    style={{
                      background: a.urgency === 'high' ? '#FEF2F2' : a.urgency === 'medium' ? '#FFFBEB' : a.urgency === 'info' ? '#EFF6FF' : '#F0FDF4',
                      color: a.urgency === 'high' ? '#EF4444' : a.urgency === 'medium' ? '#F59E0B' : a.urgency === 'info' ? '#3B82F6' : '#2EAF6F',
                    }}>{a.urgency}</span>
                  <button className="p-1.5 rounded-lg hover:bg-gray-50 transition-all">
                    <ChevronRight size={14} style={{ color: '#9CA3AF' }} />
                  </button>
                </div>
              </MotionDiv>
            ))}
            <div className="flex gap-3 pt-2">
              <Link to="/leader/contributions"
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-center transition-all hover:opacity-90 text-white"
                style={{ background: 'linear-gradient(135deg, #2EAF6F, #1d8a55)' }}>
                Manage Contributions
              </Link>
              <Link to="/leader/members"
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-center border transition-all hover:bg-gray-50"
                style={{ borderColor: '#E5E7EB', color: '#374151' }}>
                Manage Members
              </Link>
            </div>
          </MotionDiv>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <MotionDiv variants={stagger} initial="hidden" animate="visible" className="space-y-3">
            <h2 className="text-base font-extrabold text-gray-900" style={{ fontFamily: 'Nunito, sans-serif' }}>Recent Activity</h2>
            {recentActivity.map((a, i) => (
              <MotionDiv key={i} variants={fadeUp}
                className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${a.color}15` }}>
                  <a.icon size={16} style={{ color: a.color }} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">{a.label}</p>
                  <p className="text-xs text-gray-400">{a.time}</p>
                </div>
                <ArrowUpRight size={14} style={{ color: '#D1D5DB' }} />
              </MotionDiv>
            ))}
          </MotionDiv>
        )}

        {/* Four Pillars */}
        <MotionDiv variants={fadeUp} initial="hidden" animate="visible"
          className="rounded-3xl p-5 flex flex-wrap gap-4 justify-center"
          style={{ background: 'linear-gradient(135deg, #F0FDF4, #ECFDF5)', border: '1px solid #D1FAE5' }}>
          {['Trust', 'Transparency', 'Community', 'Progress'].map((p, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#2EAF6F' }} />
              <span className="text-xs font-bold" style={{ color: '#065F46' }}>{p}</span>
            </div>
          ))}
        </MotionDiv>

      </div>
    </DashboardLayout>
  );
}
